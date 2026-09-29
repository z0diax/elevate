<?php
declare(strict_types=1);

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
