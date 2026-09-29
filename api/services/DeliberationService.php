<?php
declare(strict_types=1);

function handle_deliberation(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
        sendResponse(403, [], 'Only Secretariat or an Administrator can record the committee decision.');
    }
    $decision = $data['decision'] ?? 'Approved';
    if (!in_array($decision, ['Approved', 'Not Approved'], true)) sendResponse(400, [], 'Invalid committee decision.');
    $remarks = trim((string)($data['remarks'] ?? ''));
    $awardNow = !empty($data['award_now']);

    if ($decision === 'Approved') {
        $awardStmt = $db->prepare('SELECT min_qualifying_score FROM awards WHERE id = :award_id');
        $awardStmt->execute([':award_id' => $current['award_id']]);
        $minimumScore = $awardStmt->fetchColumn();
        $finalScore = $current['final_weighted_score'];

        if ($minimumScore === false || $finalScore === null) {
            sendResponse(409, [], 'This nomination cannot be approved or awarded without an award qualifying standard and a completed evaluation score.');
        }

        if ((float)$finalScore < (float)$minimumScore) {
            sendResponse(409, [], sprintf(
                'This nomination scored %s%%, below the award qualifying standard of %s%%. It cannot be approved or awarded.',
                number_format((float)$finalScore, 2),
                number_format((float)$minimumScore, 2)
            ));
        }
    }

    if ($awardNow) {
        if ($decision !== 'Approved') {
            sendResponse(400, [], 'An award can only be conferred after approval.');
        }

        if ($current['status'] !== 'Approved' || $current['deliberation_decision'] !== 'Approved') {
            sendResponse(409, [], 'Only an approved nomination can be conferred an award.');
        }
    } elseif ($current['deliberation_decision'] !== null || !in_array($current['status'], ['Evaluation Completed', 'For Deliberation'], true)) {
        sendResponse(409, [], 'A committee decision has already been recorded for this nomination.');
    }

    $newStatus = $decision === 'Approved' ? ($awardNow ? 'Awarded' : 'Approved') : 'Not Approved';
    $stage = $awardNow ? 'Awarded' : 'Final Decision';
    $requiredAction = $awardNow ? 'Award conferred and incentive released.' : "Committee decision: {$decision}";

    $db->beginTransaction();
    try {
        $db->prepare("
            UPDATE applications
            SET status = :status,
                processing_stage = :stage,
                deliberation_decision = :decision,
                deliberation_remarks = :remarks,
                deliberation_date = CURRENT_DATE,
                award_date = :award_date,
                required_action = :required_action
            WHERE id = :id
        ")->execute([
            ':status' => $newStatus,
            ':stage' => $stage,
            ':decision' => $decision,
            ':remarks' => $remarks !== '' ? $remarks : null,
            ':award_date' => $awardNow ? date('Y-m-d') : null,
            ':required_action' => $requiredAction,
            ':id' => $appId,
        ]);

        addHistory($db, $appId, $actor, "PRAISE Committee Deliberation: {$decision}", $current['status'], $newStatus, $remarks);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:deliberate', 'Failed to record deliberation.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Deliberation decision recorded.');
}
