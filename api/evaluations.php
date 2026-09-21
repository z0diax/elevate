<?php
declare(strict_types=1);

/**
 * Evaluator scoring and deliberation support API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $actor = require_auth($db, ['ADMINISTRATOR', 'EVALUATOR']);
    $data = getJsonInput();

    $appId = $data['application_id'] ?? '';
    $evaluatorId = $data['evaluator_id'] ?? $actor['id'];
    $evaluatorName = $data['evaluator_name'] ?? $actor['full_name'];
    $evaluatorOffice = $data['evaluator_office'] ?? ($actor['office_name'] ?? '');
    $scores = $data['scores'] ?? [];
    $generalRemarks = trim((string)($data['general_remarks'] ?? ''));

    if ($appId === '' || $evaluatorId === '') {
        sendResponse(400, [], 'Application ID and Evaluator ID are required.');
    }

    $stmtApp = $db->prepare("SELECT assigned_evaluators, status FROM applications WHERE id = :id");
    $stmtApp->execute([':id' => $appId]);
    $application = $stmtApp->fetch();
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }

    $assignedEvaluators = !empty($application['assigned_evaluators'])
        ? (json_decode($application['assigned_evaluators'], true) ?: [])
        : [];

    if ($actor['role'] === 'EVALUATOR' && !empty($assignedEvaluators) && !in_array($actor['id'], $assignedEvaluators, true)) {
        sendResponse(403, [], 'This application is not assigned to your evaluator account.');
    }

    $db->beginTransaction();
    try {
        $evalId = 'eval-' . time() . '-' . rand(10, 99);

        $existingStmt = $db->prepare("SELECT id FROM evaluations WHERE application_id = :application_id AND evaluator_id = :evaluator_id");
        $existingStmt->execute([
            ':application_id' => $appId,
            ':evaluator_id' => $evaluatorId,
        ]);
        $existingId = $existingStmt->fetchColumn();

        if ($existingId) {
            $db->prepare("DELETE FROM evaluation_scores WHERE evaluation_id = :evaluation_id")->execute([':evaluation_id' => $existingId]);
            $db->prepare("DELETE FROM evaluations WHERE id = :evaluation_id")->execute([':evaluation_id' => $existingId]);
        }

        $rawTotal = 0.0;
        $weightedTotal = 0.0;
        foreach ($scores as $score) {
            $raw = (float)($score['score'] ?? ($score['raw_score'] ?? 0));
            $max = (float)($score['max_score'] ?? 100);
            $weight = (float)($score['weight_percentage'] ?? 0);
            $weighted = $max > 0 ? ($raw / $max) * $weight : 0;
            $rawTotal += $raw;
            $weightedTotal += $weighted;
        }

        $stmtEval = $db->prepare("
            INSERT INTO evaluations (
                id, application_id, evaluator_id, evaluator_name, evaluator_office,
                total_raw_score, weighted_percentage, general_remarks, is_submitted, submitted_at
            ) VALUES (
                :id, :application_id, :evaluator_id, :evaluator_name, :evaluator_office,
                :total_raw_score, :weighted_percentage, :general_remarks, 1, NOW()
            )
        ");
        $stmtEval->execute([
            ':id' => $evalId,
            ':application_id' => $appId,
            ':evaluator_id' => $evaluatorId,
            ':evaluator_name' => $evaluatorName,
            ':evaluator_office' => $evaluatorOffice,
            ':total_raw_score' => round($rawTotal, 2),
            ':weighted_percentage' => round($weightedTotal, 2),
            ':general_remarks' => $generalRemarks,
        ]);

        $stmtScore = $db->prepare("
            INSERT INTO evaluation_scores (
                id, evaluation_id, criterion_id, criterion_name, weight_percentage, max_score, score, weighted_score, remarks
            ) VALUES (
                :id, :evaluation_id, :criterion_id, :criterion_name, :weight_percentage, :max_score, :score, :weighted_score, :remarks
            )
        ");

        foreach ($scores as $index => $score) {
            $raw = (float)($score['score'] ?? ($score['raw_score'] ?? 0));
            $max = (float)($score['max_score'] ?? 100);
            $weight = (float)($score['weight_percentage'] ?? 0);
            $weighted = $max > 0 ? ($raw / $max) * $weight : 0;

            $stmtScore->execute([
                ':id' => 'sc-' . time() . '-' . $index,
                ':evaluation_id' => $evalId,
                ':criterion_id' => $score['criterion_id'] ?? ('crit-' . ($index + 1)),
                ':criterion_name' => $score['criterion_name'] ?? ('Criterion ' . ($index + 1)),
                ':weight_percentage' => $weight,
                ':max_score' => $max,
                ':score' => $raw,
                ':weighted_score' => round($weighted, 2),
                ':remarks' => $score['remarks'] ?? ($score['evaluator_remarks'] ?? ''),
            ]);
        }

        $avgStmt = $db->prepare("
            SELECT AVG(weighted_percentage) AS average_score, COUNT(*) AS evaluation_count
            FROM evaluations
            WHERE application_id = :application_id AND is_submitted = 1
        ");
        $avgStmt->execute([':application_id' => $appId]);
        $averageRow = $avgStmt->fetch();
        $averageScore = round((float)$averageRow['average_score'], 2);
        $evaluationCount = (int)$averageRow['evaluation_count'];

        $assignedCount = count($assignedEvaluators);
        $isCompleted = $assignedCount > 0 ? $evaluationCount >= $assignedCount : $evaluationCount > 0;
        $newStatus = $isCompleted ? 'Evaluation Completed' : 'Under Evaluation';
        $newStage = $isCompleted ? 'Deliberation' : 'Evaluation';
        $requiredAction = $isCompleted
            ? 'All evaluations submitted. Ready for PRAISE Committee deliberation.'
            : "Submitted evaluation ({$evaluationCount}/" . max($assignedCount, 1) . ' completed)';

        $db->prepare("
            UPDATE applications
            SET final_weighted_score = :final_weighted_score,
                status = :status,
                processing_stage = :processing_stage,
                required_action = :required_action
            WHERE id = :id
        ")->execute([
            ':final_weighted_score' => $averageScore,
            ':status' => $newStatus,
            ':processing_stage' => $newStage,
            ':required_action' => $requiredAction,
            ':id' => $appId,
        ]);

        $db->prepare("
            INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
            VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)
        ")->execute([
            ':id' => 'log-' . time(),
            ':application_id' => $appId,
            ':user_id' => $actor['id'],
            ':user_name' => $evaluatorName,
            ':user_role' => $actor['role'],
            ':action' => 'Evaluator Submitted Assessment',
            ':previous_status' => $application['status'],
            ':new_status' => $newStatus,
            ':remarks' => 'Weighted score: ' . round($weightedTotal, 2) . '%. ' . $generalRemarks,
        ]);

        $db->commit();
        sendResponse(201, [
            'average_score' => $averageScore,
            'weighted_percentage' => round($weightedTotal, 2),
            'status' => $newStatus,
        ], 'Evaluation submitted successfully.');
    } catch (Exception $e) {
        $db->rollBack();
        sendResponse(500, [], 'Failed to submit evaluation: ' . $e->getMessage());
    }
}

sendResponse(405, [], 'Method not allowed.');
