<?php
declare(strict_types=1);

/** CLI-only audit and backfill. Run before deploying code that reads only relational assignments. */
function plan_legacy_evaluator_assignments(array $application, array $assignments, array $profiles, array $evaluations): array {
    $raw = $application['assigned_evaluators'] ?? null;
    $issues = [];
    if ($raw === null || $raw === '') {
        $legacy = [];
    } else {
        try {
            $legacy = json_decode((string)$raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            return ['category' => 'E', 'issues' => ['invalid_json'], 'rows' => []];
        }
        if (!is_array($legacy)) {
            return ['category' => 'E', 'issues' => ['not_an_array'], 'rows' => []];
        }
    }

    $ordered = [];
    $seen = [];
    foreach ($legacy as $id) {
        if (!is_string($id) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D', $id)) {
            return ['category' => 'E', 'issues' => ['invalid_evaluator_id'], 'rows' => []];
        }
        if (isset($seen[$id])) {
            $issues[] = 'duplicate_evaluator_id';
            continue;
        }
        $seen[$id] = true;
        $ordered[] = $id;
    }

    if ($assignments) {
        if (!$ordered) return ['category' => 'canonical_only', 'issues' => $issues, 'rows' => []];
        $active = [];
        foreach ($assignments as $assignment) {
            if ($assignment['status'] !== 'Reassigned') $active[$assignment['evaluator_id']] = true;
        }
        $legacySet = array_fill_keys($ordered, true);
        if ($active === $legacySet || (!array_diff_key($active, $legacySet) && !array_diff_key($legacySet, $active))) {
            return ['category' => $ordered ? 'B' : 'canonical_only', 'issues' => $issues, 'rows' => []];
        }
        $issues[] = 'relational_legacy_disagreement';
        $overlap = array_intersect_key($legacySet, $active);
        return ['category' => $overlap ? 'D' : 'F', 'issues' => $issues, 'rows' => []];
    }
    if (!$ordered) {
        return $evaluations
            ? ['category' => 'E', 'issues' => ['evaluation_without_assignment'], 'rows' => []]
            : ['category' => 'A', 'issues' => $issues, 'rows' => []];
    }
    if (array_diff_key($evaluations, $seen)) {
        return ['category' => 'E', 'issues' => ['evaluation_not_in_legacy'], 'rows' => []];
    }

    $rows = [];
    foreach ($ordered as $index => $id) {
        $profile = $profiles[$id] ?? null;
        if (!$profile || $profile['role'] !== 'EVALUATOR' || !(bool)$profile['is_active']) {
            $issues[] = !$profile ? 'missing_profile' : ($profile['role'] !== 'EVALUATOR' ? 'non_evaluator_profile' : 'inactive_evaluator');
            continue;
        }
        $evaluation = $evaluations[$id] ?? null;
        if ($evaluation && (bool)$evaluation['is_submitted']) {
            $status = 'Completed';
            $completedAt = $evaluation['submitted_at'] ?: $evaluation['created_at'];
        } elseif ($evaluation) {
            $status = 'In Progress';
            $completedAt = null;
        } elseif ($application['processing_stage'] === 'Evaluation'
            && in_array($application['status'], ['For Evaluation', 'Under Evaluation'], true)) {
            $status = 'Pending';
            $completedAt = null;
        } else {
            $issues[] = 'historical_status_unclear';
            continue;
        }
        $rows[] = ['evaluator_id' => $id, 'sequence_no' => $index + 1, 'status' => $status, 'completed_at' => $completedAt];
    }
    if (array_diff($issues, ['duplicate_evaluator_id'])) {
        return ['category' => 'E', 'issues' => array_values(array_unique($issues)), 'rows' => []];
    }
    return ['category' => 'C', 'issues' => array_values(array_unique($issues)), 'rows' => $rows];
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') !== __FILE__) return;
if (PHP_SAPI !== 'cli') exit(1);
$mode = $argv[1] ?? '--audit';
if (!in_array($mode, ['--audit', '--apply', '--verify'], true)) {
    fwrite(STDERR, "Use --audit, --apply, or --verify.\n");
    exit(1);
}
require_once __DIR__ . '/../api/config/database.php';
$db = (new Database())->getConnection();
if (!$db) {
    fwrite(STDERR, "Database connection failed.\n");
    exit(1);
}

$ids = $db->query('SELECT id FROM applications ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
$totals = [];
$review = 0;
$pending = 0;
$created = 0;
foreach ($ids as $appId) {
    try {
        if ($mode === '--apply') $db->beginTransaction();
        $appStmt = $db->prepare('SELECT id, application_number, assigned_evaluators, status, processing_stage FROM applications WHERE id = :id' . ($mode === '--apply' ? ' FOR UPDATE' : ''));
        $appStmt->execute([':id' => $appId]);
        $app = $appStmt->fetch();
        if (!$app) {
            if ($db->inTransaction()) $db->rollBack();
            continue;
        }
        $assignmentStmt = $db->prepare('SELECT evaluator_id, status FROM application_evaluator_assignments WHERE application_id = :id');
        $assignmentStmt->execute([':id' => $appId]);
        $assignments = $assignmentStmt->fetchAll();
        $profileRows = $db->query('SELECT id, role, is_active FROM profiles')->fetchAll();
        $profiles = array_column($profileRows, null, 'id');
        $evaluationStmt = $db->prepare('SELECT evaluator_id, is_submitted, submitted_at, created_at FROM evaluations WHERE application_id = :id');
        $evaluationStmt->execute([':id' => $appId]);
        $evaluations = array_column($evaluationStmt->fetchAll(), null, 'evaluator_id');
        $plan = plan_legacy_evaluator_assignments($app, $assignments, $profiles, $evaluations);
        $totals[$plan['category']] = ($totals[$plan['category']] ?? 0) + 1;
        if (in_array($plan['category'], ['D', 'E', 'F'], true)) $review++;
        if ($plan['category'] === 'C' && $mode !== '--apply') $pending++;
        if ($mode === '--apply' && $plan['category'] === 'C') {
            $insert = $db->prepare('INSERT INTO application_evaluator_assignments (id, application_id, evaluator_id, route_id, sequence_no, status, completed_at) VALUES (:id, :application_id, :evaluator_id, NULL, :sequence_no, :status, :completed_at)');
            foreach ($plan['rows'] as $row) {
                $insert->execute([
                    ':id' => 'assign-' . bin2hex(random_bytes(16)), ':application_id' => $appId,
                    ':evaluator_id' => $row['evaluator_id'], ':sequence_no' => $row['sequence_no'],
                    ':status' => $row['status'], ':completed_at' => $row['completed_at'],
                ]);
                $created++;
            }
        }
        if ($db->inTransaction()) $db->commit();
        if ($plan['issues'] || !in_array($plan['category'], ['A', 'B', 'canonical_only'], true)) {
            echo $app['id'] . ' ' . $app['application_number'] . ' category=' . $plan['category']
                . ' planned=' . count($plan['rows']) . ' issues=' . implode(',', $plan['issues']) . "\n";
        }
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        fwrite(STDERR, 'Migration stopped at application ' . $appId . ': ' . $error->getMessage() . "\n");
        exit(1);
    }
}
ksort($totals);
echo 'Categories: ' . json_encode($totals) . "; rows created: {$created}; pending backfill: {$pending}; manual review: {$review}\n";
if ($mode === '--verify' && ($review > 0 || $pending > 0)) exit(2);
