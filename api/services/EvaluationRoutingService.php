<?php
declare(strict_types=1);

function handle_reassign_evaluator(PDO $db, array $actor, array $data, string $appId): void {
    try {
        reassign_application_evaluator($db, $actor, $appId, $data['old_evaluator_id'], $data['new_evaluator_id']);
    } catch (EvaluatorReassignmentError $error) {
        sendResponse($error->httpStatus, [], $error->getMessage());
    } catch (Throwable $error) {
        sendInternalError($error, 'applications.php:reassign_evaluator', 'Failed to reassign evaluator.');
    }
    sendResponse(200, getFullApplication($db, $appId), 'Evaluator reassigned successfully.');
}

function handle_assign_evaluators(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
        sendResponse(403, [], 'Only Secretariat staff can route nominations to evaluators.');
    }
    if ($current['processing_stage'] === 'Evaluation' && in_array($current['status'], ['For Evaluation', 'Under Evaluation'], true) && !empty($current['evaluator_assignments'])) {
        sendResponse(200, $current, 'Evaluators already assigned.');
    }
    if ($current['processing_stage'] !== 'Document Verification' || $current['status'] !== 'Verified') {
        sendResponse(409, [], 'Only a verified nomination can be routed to evaluators.');
    }
    $remarks = trim((string)($data['remarks'] ?? 'Assigned PRAISE evaluators.'));

    $db->beginTransaction();
    try {
        $locked = $db->prepare('SELECT award_id, application_number, award_name, status FROM applications WHERE id = :id FOR UPDATE');
        $locked->execute([':id' => $appId]);
        $lockedApp = $locked->fetch();
        if ($lockedApp['status'] !== 'Verified') {
            $db->rollBack();
            sendResponse(409, [], 'This nomination has already left document verification.');
        }
        $routeStmt = $db->prepare("SELECT r.id, r.required_evaluators FROM award_evaluation_routes r JOIN awards a ON a.id = r.award_id WHERE r.award_id = :award_id AND r.is_active = 1 AND a.is_active = 1 FOR UPDATE");
        $routeStmt->execute([':award_id' => $lockedApp['award_id']]);
        $route = $routeStmt->fetch();
        if (!$route) {
            $db->rollBack();
            sendResponse(409, [], 'Evaluation routing has not been configured or enabled for this award.');
        }
        $members = $db->prepare("SELECT p.id FROM award_route_evaluators are JOIN profiles p ON p.id = are.evaluator_id WHERE are.route_id = :route_id AND are.is_active = 1 AND p.is_active = 1 AND p.role = 'EVALUATOR' ORDER BY are.sequence_no");
        $members->execute([':route_id' => $route['id']]);
        $evaluatorIds = $members->fetchAll(PDO::FETCH_COLUMN);
        if (count($evaluatorIds) !== (int)$route['required_evaluators']) {
            $db->rollBack();
            sendResponse(409, [], 'Evaluation routing is incomplete or contains inactive evaluators. Ask an Administrator to update this award.');
        }
        $existing = $db->prepare('SELECT COUNT(*) FROM application_evaluator_assignments WHERE application_id = :id');
        $existing->execute([':id' => $appId]);
        if ((int)$existing->fetchColumn() > 0) {
            $db->rollBack();
            sendResponse(409, [], 'This nomination already has evaluator assignments.');
        }
        $insert = $db->prepare('INSERT INTO application_evaluator_assignments (id, application_id, evaluator_id, route_id, sequence_no) VALUES (:id, :application_id, :evaluator_id, :route_id, :sequence_no)');
        $notify = $db->prepare("INSERT INTO notifications (id, user_id, target_role, application_id, application_number, title, message, link_tab) VALUES (:id, :user_id, NULL, :application_id, :application_number, 'New Evaluation Assignment', :message, 'evaluator-queue')");
        foreach ($evaluatorIds as $index => $evaluatorId) {
            $insert->execute([':id' => 'assign-' . bin2hex(random_bytes(16)), ':application_id' => $appId, ':evaluator_id' => $evaluatorId, ':route_id' => $route['id'], ':sequence_no' => $index + 1]);
            $notify->execute([':id' => 'notif-' . bin2hex(random_bytes(16)), ':user_id' => $evaluatorId, ':application_id' => $appId, ':application_number' => $lockedApp['application_number'], ':message' => 'You have been assigned to evaluate a nomination for ' . $lockedApp['award_name'] . '.']);
        }
        $db->prepare("
            UPDATE applications
            SET final_weighted_score = NULL,
                status = 'For Evaluation',
                processing_stage = 'Evaluation',
                required_action = 'Evaluator assessment in progress'
            WHERE id = :id
        ")->execute([
            ':id' => $appId,
        ]);

        addHistory($db, $appId, $actor, 'Routed to Evaluators', $current['status'], 'For Evaluation', $remarks . ' Evaluation routing applied. Assigned to ' . count($evaluatorIds) . ' evaluators.');
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:assign_evaluators', 'Failed to assign evaluators.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Evaluators assigned.');
}

final class EvaluatorReassignmentError extends RuntimeException {
    public function __construct(public readonly int $httpStatus, string $message) {
        parent::__construct($message);
    }
}

function reassign_application_evaluator(PDO $db, array $actor, string $appId, string $oldEvaluatorId, string $newEvaluatorId): void {
    if (($actor['role'] ?? '') !== 'ADMINISTRATOR') {
        throw new EvaluatorReassignmentError(403, 'Only an Administrator can reassign evaluators.');
    }
    if ($oldEvaluatorId === $newEvaluatorId) {
        throw new EvaluatorReassignmentError(400, 'Select a different replacement evaluator.');
    }

    $db->beginTransaction();
    try {
        // Application locks serialize reassignment with evaluation start and submission.
        $appStmt = $db->prepare('SELECT id, application_number, status, processing_stage FROM applications WHERE id = :id FOR UPDATE');
        $appStmt->execute([':id' => $appId]);
        $app = $appStmt->fetch();
        if (!$app) throw new EvaluatorReassignmentError(404, 'Nomination not found.');
        if ($app['processing_stage'] !== 'Evaluation' || !in_array($app['status'], ['For Evaluation', 'Under Evaluation'], true)) {
            throw new EvaluatorReassignmentError(409, 'This nomination is no longer open for evaluator reassignment.');
        }

        $assignmentStmt = $db->prepare('SELECT id, evaluator_id, sequence_no, status FROM application_evaluator_assignments WHERE application_id = :id FOR UPDATE');
        $assignmentStmt->execute([':id' => $appId]);
        $assignments = $assignmentStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$assignments) throw new EvaluatorReassignmentError(409, 'This nomination has no evaluator assignment records.');

        $oldAssignment = null;
        foreach ($assignments as $assignment) {
            if ($assignment['evaluator_id'] === $oldEvaluatorId) $oldAssignment = $assignment;
        }
        if (!$oldAssignment) throw new EvaluatorReassignmentError(404, 'The evaluator assignment was not found.');
        if ($oldAssignment['status'] === 'Reassigned') throw new EvaluatorReassignmentError(409, 'This evaluator was already reassigned.');
        if ($oldAssignment['status'] === 'Completed') throw new EvaluatorReassignmentError(409, 'A completed evaluation cannot be reassigned. Its scores remain on record.');
        if (!in_array($oldAssignment['status'], ['Pending', 'In Progress'], true)) {
            throw new EvaluatorReassignmentError(409, 'This evaluator assignment cannot be reassigned.');
        }
        foreach ($assignments as $assignment) {
            if ($assignment['evaluator_id'] === $newEvaluatorId) {
                $message = $assignment['status'] === 'Reassigned'
                    ? 'This evaluator was previously assigned to the nomination and cannot be assigned again.'
                    : 'The replacement evaluator is already assigned to this nomination.';
                throw new EvaluatorReassignmentError(409, $message);
            }
        }

        $replacementStmt = $db->prepare('SELECT id, full_name, role, is_active FROM profiles WHERE id = :id FOR UPDATE');
        $replacementStmt->execute([':id' => $newEvaluatorId]);
        $replacement = $replacementStmt->fetch(PDO::FETCH_ASSOC);
        if (!$replacement) throw new EvaluatorReassignmentError(404, 'Replacement evaluator not found.');
        if ($replacement['role'] !== 'EVALUATOR') throw new EvaluatorReassignmentError(400, 'Replacement account must have the Evaluator role.');
        if (!(bool)$replacement['is_active']) throw new EvaluatorReassignmentError(409, 'Replacement evaluator account is inactive.');

        $oldProfileStmt = $db->prepare('SELECT full_name FROM profiles WHERE id = :id');
        $oldProfileStmt->execute([':id' => $oldEvaluatorId]);
        $oldName = $oldProfileStmt->fetchColumn() ?: $oldEvaluatorId;

        $update = $db->prepare("UPDATE application_evaluator_assignments SET status = 'Reassigned' WHERE id = :id AND status IN ('Pending', 'In Progress')");
        $update->execute([':id' => $oldAssignment['id']]);
        if ($update->rowCount() !== 1) throw new EvaluatorReassignmentError(409, 'The evaluator assignment changed. Refresh and try again.');

        // A manual nomination-level replacement is not a change to the award route.
        $insert = $db->prepare("INSERT INTO application_evaluator_assignments (id, application_id, evaluator_id, route_id, sequence_no, status) VALUES (:id, :app_id, :evaluator_id, NULL, :sequence_no, 'Pending')");
        $insert->execute([
            ':id' => 'assign-' . bin2hex(random_bytes(16)),
            ':app_id' => $appId,
            ':evaluator_id' => $newEvaluatorId,
            ':sequence_no' => $oldAssignment['sequence_no'],
        ]);
        $db->prepare('UPDATE applications SET final_weighted_score = NULL, updated_at = NOW() WHERE id = :id')->execute([':id' => $appId]);

        $history = $db->prepare('INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks) VALUES (:id, :app_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)');
        $history->execute([
            ':id' => 'log-' . bin2hex(random_bytes(16)),
            ':app_id' => $appId,
            ':user_id' => $actor['id'],
            ':user_name' => $actor['full_name'],
            ':user_role' => $actor['role'],
            ':action' => 'Evaluator Reassigned',
            ':previous_status' => $app['status'],
            ':new_status' => $app['status'],
            ':remarks' => "Nomination {$app['application_number']}: {$oldName} ({$oldEvaluatorId}) replaced by {$replacement['full_name']} ({$newEvaluatorId}).",
        ]);

        $notify = $db->prepare('INSERT INTO notifications (id, user_id, target_role, application_id, application_number, title, message, link_tab) VALUES (:id, :user_id, NULL, :app_id, :application_number, :title, :message, :link_tab)');
        foreach ([
            [$oldEvaluatorId, 'Evaluation Assignment Changed', "Nomination {$app['application_number']} is no longer assigned to you for evaluation."],
            [$newEvaluatorId, 'New Evaluation Assignment', "You have been assigned to evaluate nomination {$app['application_number']}."]
        ] as [$userId, $title, $message]) {
            $notify->execute([
                ':id' => 'notif-' . bin2hex(random_bytes(16)),
                ':user_id' => $userId,
                ':app_id' => $appId,
                ':application_number' => $app['application_number'],
                ':title' => $title,
                ':message' => $message,
                ':link_tab' => 'evaluator-queue',
            ]);
        }

        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
