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

if ($method === 'POST' && ($_GET['action'] ?? '') === 'start') {
    $actor = require_auth($db, ['EVALUATOR']);
    $data = getJsonInput();
    $appId = (string)($data['application_id'] ?? '');
    if ($appId === '') sendResponse(400, [], 'Application ID is required.');
    try {
        $db->beginTransaction();
        $appStmt = $db->prepare('SELECT status, processing_stage, assigned_evaluators FROM applications WHERE id = :id FOR UPDATE');
        $appStmt->execute([':id' => $appId]);
        $app = $appStmt->fetch();
        if (!$app || $app['processing_stage'] !== 'Evaluation' || !in_array($app['status'], ['For Evaluation', 'Under Evaluation'], true)) {
            $db->rollBack();
            sendResponse(409, [], 'This nomination is not open for evaluation.');
        }
        $assignment = $db->prepare('SELECT status FROM application_evaluator_assignments WHERE application_id = :app_id AND evaluator_id = :evaluator_id FOR UPDATE');
        $assignment->execute([':app_id' => $appId, ':evaluator_id' => $actor['id']]);
        $status = $assignment->fetchColumn();
        if ($status === false) {
            $count = $db->prepare('SELECT COUNT(*) FROM application_evaluator_assignments WHERE application_id = :id');
            $count->execute([':id' => $appId]);
            $legacyIds = json_decode((string)($app['assigned_evaluators'] ?? '[]'), true) ?: [];
            if ((int)$count->fetchColumn() > 0 || !in_array($actor['id'], $legacyIds, true)) {
                $db->rollBack();
                sendResponse(403, [], 'This nomination is not assigned to your evaluator account.');
            }
        } elseif ($status === 'Reassigned') {
            $db->rollBack();
            sendResponse(403, [], 'This nomination is no longer assigned to you.');
        } elseif ($status === 'Pending') {
            $db->prepare("UPDATE application_evaluator_assignments SET status = 'In Progress' WHERE application_id = :app_id AND evaluator_id = :evaluator_id")
                ->execute([':app_id' => $appId, ':evaluator_id' => $actor['id']]);
        }
        $db->commit();
        sendResponse(200, [], 'Evaluation started.');
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendInternalError($e, 'evaluations.php:start', 'Failed to start evaluation.');
    }
}

if ($method === 'POST') {
    $actor = require_auth($db, ['EVALUATOR']);
    $data = getJsonInput();

    $appId = $data['application_id'] ?? '';
    $evaluatorId = $actor['id'];
    $evaluatorName = $actor['full_name'];
    $evaluatorOffice = $actor['office_name'] ?? '';
    $scores = $data['scores'] ?? [];
    $generalRemarks = trim((string)($data['general_remarks'] ?? ''));

    if ($appId === '' || $evaluatorId === '') {
        sendResponse(400, [], 'Application ID and Evaluator ID are required.');
    }

    $stmtApp = $db->prepare("SELECT award_id, assigned_evaluators, status, processing_stage FROM applications WHERE id = :id");
    $stmtApp->execute([':id' => $appId]);
    $application = $stmtApp->fetch();
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }
    if ($application['processing_stage'] !== 'Evaluation' || !in_array($application['status'], ['For Evaluation', 'Under Evaluation'], true)) {
        sendResponse(409, [], 'This nomination is not currently open for evaluator assessment.');
    }

    $assignedEvaluators = !empty($application['assigned_evaluators'])
        ? (json_decode($application['assigned_evaluators'], true) ?: [])
        : [];

    $assignedEvaluators = is_array($assignedEvaluators)
        ? array_values(array_unique(array_filter($assignedEvaluators, 'is_string')))
        : [];
    $assignmentStmt = $db->prepare("SELECT evaluator_id, status FROM application_evaluator_assignments WHERE application_id = :id");
    $assignmentStmt->execute([':id' => $appId]);
    $assignments = $assignmentStmt->fetchAll();
    if ($assignments) {
        $assignedEvaluators = array_column(array_filter($assignments, static fn($assignment) => $assignment['status'] !== 'Reassigned'), 'evaluator_id');
    }
    if (!$assignedEvaluators) {
        sendResponse(409, [], 'This nomination has no assigned evaluators and cannot complete evaluation.');
    }
    if (!in_array($actor['id'], $assignedEvaluators, true)) {
        sendResponse(403, [], 'This application is not assigned to your evaluator account.');
    }
    $criteriaStmt = $db->prepare('SELECT id, criterion_name, weight_percentage, max_score FROM award_criteria WHERE award_id = :award_id');
    $criteriaStmt->execute([':award_id' => $application['award_id']]);
    $criteria = [];
    foreach ($criteriaStmt->fetchAll() as $criterion) $criteria[$criterion['id']] = $criterion;
    if (!$criteria || !is_array($scores) || count($scores) !== count($criteria)) sendResponse(400, [], 'A score is required for every award criterion.');
    $validatedScores = [];
    foreach ($scores as $score) {
        if (!is_array($score) || !is_string($score['criterion_id'] ?? null) || !isset($criteria[$score['criterion_id']]) || isset($validatedScores[$score['criterion_id']])) {
            sendResponse(400, [], 'Invalid evaluation criterion.');
        }
        $criterion = $criteria[$score['criterion_id']];
        $raw = $score['score'] ?? ($score['raw_score'] ?? null);
        if (!is_numeric($raw) || !is_finite((float)$raw) || (float)$raw < 0 || (float)$raw > (float)$criterion['max_score']) {
            sendResponse(400, [], 'Score is outside the permitted range.');
        }
        $validatedScores[$score['criterion_id']] = [
            'criterion_id' => $criterion['id'], 'criterion_name' => $criterion['criterion_name'],
            'score' => (float)$raw, 'max_score' => (float)$criterion['max_score'],
            'weight_percentage' => (float)$criterion['weight_percentage'],
            'remarks' => (string)($score['remarks'] ?? ($score['evaluator_remarks'] ?? '')),
        ];
    }
    $scores = array_values($validatedScores);

    $db->beginTransaction();
    try {
        // Serialize submissions for this nomination so the completion check sees every committed score.
        $lockStmt = $db->prepare('SELECT status, processing_stage FROM applications WHERE id = :id FOR UPDATE');
        $lockStmt->execute([':id' => $appId]);
        $lockedApplication = $lockStmt->fetch();
        if ($lockedApplication['processing_stage'] !== 'Evaluation' || !in_array($lockedApplication['status'], ['For Evaluation', 'Under Evaluation'], true)) {
            $db->rollBack();
            sendResponse(409, [], 'This nomination is not currently open for evaluator assessment.');
        }
        if ($assignments) {
            $own = $db->prepare("SELECT status FROM application_evaluator_assignments WHERE application_id = :app_id AND evaluator_id = :evaluator_id FOR UPDATE");
            $own->execute([':app_id' => $appId, ':evaluator_id' => $evaluatorId]);
            $ownStatus = $own->fetchColumn();
            if ($ownStatus === 'Completed' || $ownStatus === 'Reassigned' || $ownStatus === false) {
                $db->rollBack();
                sendResponse(409, [], 'Your evaluation has already been submitted or is no longer assigned.');
            }
        }
        $evalId = 'eval-' . bin2hex(random_bytes(16));

        $existingStmt = $db->prepare("SELECT id FROM evaluations WHERE application_id = :application_id AND evaluator_id = :evaluator_id");
        $existingStmt->execute([
            ':application_id' => $appId,
            ':evaluator_id' => $evaluatorId,
        ]);
        $existingIds = $existingStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($existingIds as $existingId) {
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
                ':id' => 'sc-' . bin2hex(random_bytes(16)),
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

        if ($assignments) {
            $db->prepare("UPDATE application_evaluator_assignments SET status = 'Completed', completed_at = NOW() WHERE application_id = :app_id AND evaluator_id = :evaluator_id")
                ->execute([':app_id' => $appId, ':evaluator_id' => $evaluatorId]);
        }

        $avgStmt = $db->prepare("
            SELECT evaluator_id, weighted_percentage
            FROM evaluations
            WHERE application_id = :application_id AND is_submitted = 1
            ORDER BY submitted_at DESC, id DESC
        ");
        $avgStmt->execute([':application_id' => $appId]);
        $assignedSet = array_fill_keys($assignedEvaluators, true);
        $submittedScores = [];
        foreach ($avgStmt->fetchAll() as $submittedEvaluation) {
            $submittedId = $submittedEvaluation['evaluator_id'];
            if (isset($assignedSet[$submittedId]) && !array_key_exists($submittedId, $submittedScores)) {
                $submittedScores[$submittedId] = (float)$submittedEvaluation['weighted_percentage'];
            }
        }
        $evaluationCount = count($submittedScores);

        $assignedCount = count($assignedEvaluators);
        $isCompleted = $assignedCount > 0 && $evaluationCount === $assignedCount;
        $averageScore = $evaluationCount > 0 ? round(array_sum($submittedScores) / $evaluationCount, 2) : null;
        $newStatus = $isCompleted ? 'Evaluation Completed' : 'Under Evaluation';
        $newStage = $isCompleted ? 'Deliberation' : 'Evaluation';
        $requiredAction = $isCompleted
            ? 'All assigned evaluators have submitted. Ready for PRAISE Committee deliberation.'
            : "Evaluator assessment in progress. {$evaluationCount} of {$assignedCount} evaluations submitted.";

        $db->prepare("
            UPDATE applications
            SET final_weighted_score = :final_weighted_score,
                status = :status,
                processing_stage = :processing_stage,
                required_action = :required_action
            WHERE id = :id
        ")->execute([
            ':final_weighted_score' => $isCompleted ? $averageScore : null,
            ':status' => $newStatus,
            ':processing_stage' => $newStage,
            ':required_action' => $requiredAction,
            ':id' => $appId,
        ]);

        $db->prepare("
            INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
            VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)
        ")->execute([
            ':id' => 'log-' . bin2hex(random_bytes(16)),
            ':application_id' => $appId,
            ':user_id' => $actor['id'],
            ':user_name' => $evaluatorName,
            ':user_role' => $actor['role'],
            ':action' => 'Evaluator Submitted Assessment',
            ':previous_status' => $lockedApplication['status'],
            ':new_status' => $newStatus,
            ':remarks' => 'Weighted score: ' . round($weightedTotal, 2) . '%. ' . $generalRemarks,
        ]);

        if ($isCompleted) {
            $db->prepare("
                INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
                VALUES (:id, :application_id, NULL, 'System', 'SYSTEM', 'All Evaluations Completed', :previous_status, 'Evaluation Completed', :remarks)
            ")->execute([
                ':id' => 'log-' . bin2hex(random_bytes(16)),
                ':application_id' => $appId,
                ':previous_status' => $lockedApplication['status'],
                ':remarks' => "{$evaluationCount} of {$assignedCount} assigned evaluators submitted their assessments. "
                    . 'Final consolidated evaluator score: ' . number_format($averageScore, 2, '.', '') . '%. '
                    . 'Application automatically advanced to PRAISE Committee deliberation.',
            ]);
        }

        $db->commit();
        sendResponse(201, [
            'average_score' => $averageScore,
            'weighted_percentage' => round($weightedTotal, 2),
            'status' => $newStatus,
        ], 'Evaluation submitted successfully.');
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'evaluations.php:submit', 'Failed to submit evaluation.');
    }
}

sendResponse(405, [], 'Method not allowed.');
