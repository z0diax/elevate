<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/services/ApplicationPrivacy.php';

function privacyCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
$application = [
    'id' => 'app-fixture', 'nominator_id' => 'filer', 'nominator_name' => 'Recorded Nominator',
    'nominee_name' => 'Recorded Nominee', 'status' => 'Approved', 'processing_stage' => 'Final Decision',
    'required_action' => 'Committee decision: Approved', 'remarks' => 'Please replace the missing attachment.',
    'signature_signed_at' => '2026-11-19 10:00:00', 'award_date' => null,
    'documents' => [['id' => 'document', 'file_url' => '/api/documents.php?action=download&id=document']],
    'endorsement' => ['decision' => 'Endorsed'],
    'evaluations' => [['scores' => [['score' => 93.75]], 'general_remarks' => 'PRIVATE-ASSESSMENT']],
    'final_weighted_score' => 93.75, 'deliberation_remarks' => 'PRIVATE-COMMITTEE',
    'deliberation_decision' => 'Approved', 'deliberation_date' => '2026-11-19',
    'evaluator_assignments' => [['evaluator_name' => 'PRIVATE-EVALUATOR']],
    'assigned_evaluators' => ['PRIVATE-EVALUATOR'], 'future_internal_field' => 'PRIVATE-FUTURE',
];
$original = $application;
$nominee = ['id' => 'filer', 'role' => 'NOMINEE'];
$view = application_for_actor($application, $nominee);
foreach (['evaluations', 'final_weighted_score', 'deliberation_remarks', 'deliberation_decision', 'deliberation_date', 'evaluator_assignments', 'assigned_evaluators', 'future_internal_field'] as $field) {
    privacyCheck(!array_key_exists($field, $view), "Nominee received {$field}.");
}
foreach (['documents', 'endorsement', 'remarks', 'required_action', 'status', 'signature_signed_at', 'nominator_name'] as $field) {
    privacyCheck($view[$field] === $application[$field], "Public nomination field {$field} changed.");
}
privacyCheck(!str_contains(json_encode($view), 'PRIVATE-'), 'Confidential values survived serialization.');
privacyCheck($application === $original, 'Response shaping modified the original record.');
foreach (['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE'] as $role) {
    privacyCheck(application_for_actor($application, ['role' => $role]) === $original, "{$role} lost access to existing review data.");
}
$evaluator = application_for_actor($application, ['role' => 'EVALUATOR']);
privacyCheck(!isset($evaluator['nominator_name'], $evaluator['signature_signed_at']), 'Evaluator identity restriction regressed.');
privacyCheck($evaluator['evaluations'] === $application['evaluations'], 'Evaluator scoring behavior changed unexpectedly.');

$baseLog = ['id' => 'history', 'application_id' => 'app-fixture', 'created_at' => '2026-11-19 10:00:00', 'previous_status' => 'For Evaluation', 'new_status' => 'Evaluation Completed', 'user_id' => 'reviewer', 'user_name' => 'PRIVATE-REVIEWER', 'user_role' => 'EVALUATOR'];
$logs = [];
foreach (['Evaluator Submitted Assessment', 'Evaluation Revised', 'All Evaluations Completed', 'Evaluator Reassigned', 'PRAISE Committee Deliberation: Approved', 'Future internal action PRIVATE-ACTION'] as $action) {
    $logs[] = $baseLog + ['action' => $action, 'remarks' => 'Weighted score: 93.75%. PRIVATE-NOTE', 'future_private_field' => 'PRIVATE-FUTURE'];
}
$logs[] = array_replace($baseLog, ['user_id' => 'filer', 'user_name' => 'Recorded Nominator', 'user_role' => 'NOMINEE', 'action' => 'Nomination Submitted', 'remarks' => 'Submitted with attachments.']);
$logs[] = $baseLog + ['action' => 'Returned for Revision', 'remarks' => 'Please replace the missing attachment.'];
$originalLogs = $logs;
$history = application_history_for_actor($logs, $application, $nominee);
privacyCheck(count($history) === count($logs), 'Workflow timeline entries were lost.');
privacyCheck(!str_contains(json_encode($history), 'PRIVATE-'), 'History exposes internal scores, notes or reviewer identity.');
privacyCheck(!str_contains(json_encode($history), '93.75'), 'History exposes a numeric score.');
privacyCheck($history[6]['action'] === 'Nomination Submitted' && $history[6]['user_name'] === 'Recorded Nominator', 'Submission provenance was lost.');
privacyCheck($history[7]['remarks'] === 'Please replace the missing attachment.', 'Revision instructions were removed.');
privacyCheck($history[0]['created_at'] === $baseLog['created_at'] && $history[0]['new_status'] === 'Evaluation Completed', 'Public workflow progress changed.');
privacyCheck($logs === $originalLogs, 'History shaping modified stored history.');
foreach (['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE'] as $role) {
    privacyCheck(application_history_for_actor($logs, $application, ['role' => $role]) === $logs, "{$role} audit history changed.");
}
$evaluatorHistory = application_history_for_actor($logs, $application, ['role' => 'EVALUATOR']);
privacyCheck($evaluatorHistory[6]['user_id'] === null && $evaluatorHistory[6]['user_name'] === 'Nominator', 'Evaluator history exposes filer identity.');
echo "Nominee response and history privacy checks passed.\n";
