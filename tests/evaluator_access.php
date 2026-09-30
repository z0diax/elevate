<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/services/ApplicationAccess.php';

$application = [
    'status' => 'Under Evaluation', 'processing_stage' => 'Evaluation',
    'nominator_id' => 'filer', 'nominee_id' => 'nominee', 'office_id' => 'office-1',
    'evaluator_assignments' => [
        ['evaluator_id' => 'A', 'status' => 'Completed'],
        ['evaluator_id' => 'B', 'status' => 'Reassigned'],
        ['evaluator_id' => 'C', 'status' => 'Pending'],
    ],
];
$actor = static fn(string $id, string $role, ?string $office = null): array => ['id' => $id, 'role' => $role, 'office_id' => $office];
if (!canViewApplication($application, $actor('A', 'EVALUATOR'))
    || !canViewApplication($application, $actor('C', 'EVALUATOR'))
    || canViewApplication($application, $actor('B', 'EVALUATOR'))
    || canViewApplication($application, $actor('D', 'EVALUATOR'))
    || !canViewApplication($application, $actor('filer', 'NOMINEE'))
    || !canViewApplication($application, $actor('nominee', 'NOMINEE'))
    || !canViewApplication($application, $actor('head', 'HEAD_OF_OFFICE', 'office-1'))
    || !canViewApplication($application, $actor('secretary', 'SECRETARIAT'))
    || !canViewApplication($application, $actor('admin', 'ADMINISTRATOR'))) {
    throw new RuntimeException('Application access rules changed unexpectedly.');
}
$application['evaluator_assignments'] = [];
$application['assigned_evaluators'] = ['A']; // Obsolete data must not grant access.
if (canViewApplication($application, $actor('A', 'EVALUATOR'))) {
    throw new RuntimeException('Legacy-only evaluator gained access.');
}
echo "Canonical evaluator access checks passed.\n";
