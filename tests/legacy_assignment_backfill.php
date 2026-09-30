<?php
declare(strict_types=1);

require_once __DIR__ . '/../database_migrations/20260929_backfill_legacy_evaluator_assignments.php';

function check_plan(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$app = ['assigned_evaluators' => '["A","B","C"]', 'processing_stage' => 'Evaluation', 'status' => 'Under Evaluation'];
$profiles = array_fill_keys(['A', 'B', 'C', 'D'], ['role' => 'EVALUATOR', 'is_active' => 1]);
$plan = plan_legacy_evaluator_assignments($app, [], $profiles, ['A' => ['is_submitted' => 1, 'submitted_at' => '2026-09-01 10:00:00', 'created_at' => '2026-09-01 09:00:00']]);
check_plan($plan['category'] === 'C', 'Legacy-only nomination must be backfillable.');
check_plan(array_column($plan['rows'], 'evaluator_id') === ['A', 'B', 'C'], 'Evaluator order changed.');
check_plan(array_column($plan['rows'], 'sequence_no') === [1, 2, 3], 'Sequence numbers changed.');
check_plan(array_column($plan['rows'], 'status') === ['Completed', 'Pending', 'Pending'], 'Submitted evaluation was not completed.');
check_plan($plan['rows'][0]['completed_at'] === '2026-09-01 10:00:00', 'Completion time was not preserved.');

$existing = array_map(static fn($id) => ['evaluator_id' => $id, 'status' => 'Pending'], ['A', 'B', 'C']);
check_plan(plan_legacy_evaluator_assignments($app, $existing, $profiles, [])['category'] === 'B', 'Already migrated nomination should be unchanged.');
$canonicalOnly = $app;
$canonicalOnly['assigned_evaluators'] = '[]';
check_plan(plan_legacy_evaluator_assignments($canonicalOnly, $existing, $profiles, [])['category'] === 'canonical_only', 'New routed nomination needs no legacy review.');
$richer = [
    ['evaluator_id' => 'A', 'status' => 'Completed'], ['evaluator_id' => 'B', 'status' => 'Reassigned'],
    ['evaluator_id' => 'C', 'status' => 'Completed'], ['evaluator_id' => 'D', 'status' => 'Pending'],
];
$plan = plan_legacy_evaluator_assignments($app, $richer, $profiles, []);
check_plan($plan['rows'] === [] && in_array($plan['category'], ['D', 'F'], true), 'Relational history must remain authoritative.');

$duplicate = $app;
$duplicate['assigned_evaluators'] = '["A","A","B"]';
$plan = plan_legacy_evaluator_assignments($duplicate, [], $profiles, []);
check_plan(array_column($plan['rows'], 'evaluator_id') === ['A', 'B'], 'Duplicate evaluator was inserted.');
check_plan(in_array('duplicate_evaluator_id', $plan['issues'], true), 'Duplicate was not audited.');

$invalid = $app;
$invalid['assigned_evaluators'] = '["A","missing"]';
$plan = plan_legacy_evaluator_assignments($invalid, [], $profiles, []);
check_plan($plan['category'] === 'E' && $plan['rows'] === [] && in_array('missing_profile', $plan['issues'], true), 'Missing profile must block the entire application.');
$invalid['assigned_evaluators'] = '{"bad":"shape"}';
check_plan(plan_legacy_evaluator_assignments($invalid, [], $profiles, [])['category'] === 'E', 'Malformed JSON shape was accepted.');
$invalid['assigned_evaluators'] = '{}';
check_plan(plan_legacy_evaluator_assignments($invalid, [], $profiles, [])['category'] === 'E', 'Empty JSON object was accepted as an array.');
$profiles['B']['is_active'] = 0;
check_plan(plan_legacy_evaluator_assignments($app, [], $profiles, [])['category'] === 'E', 'Inactive evaluator was backfilled.');
$profiles['B']['is_active'] = 1;
check_plan(plan_legacy_evaluator_assignments($app, [], $profiles, ['D' => ['is_submitted' => 1]])['category'] === 'E', 'Evaluation missing from legacy list needs review.');

echo "Legacy assignment audit and backfill plans passed.\n";
