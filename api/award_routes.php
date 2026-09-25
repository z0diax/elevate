<?php
declare(strict_types=1);

require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$db = (new Database())->getConnection();
if (!$db) sendResponse(503, [], 'Database connection failed.');
$actor = require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT']);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && ($_GET['action'] ?? '') === 'evaluators') {
    $stmt = $db->query("SELECT id, full_name, office_name FROM profiles WHERE role = 'EVALUATOR' AND is_active = 1 ORDER BY full_name");
    sendResponse(200, $stmt->fetchAll());
}

$awardId = (string)($_GET['award_id'] ?? '');
if ($awardId === '') sendResponse(400, [], 'Award ID is required.');

if ($method === 'GET') {
    $stmt = $db->prepare('SELECT * FROM award_evaluation_routes WHERE award_id = :award_id');
    $stmt->execute([':award_id' => $awardId]);
    $route = $stmt->fetch();
    if (!$route) sendResponse(200, null);
    $members = $db->prepare('SELECT are.*, p.full_name FROM award_route_evaluators are JOIN profiles p ON p.id = are.evaluator_id WHERE are.route_id = :route_id AND are.is_active = 1 ORDER BY are.sequence_no');
    $members->execute([':route_id' => $route['id']]);
    $route['required_evaluators'] = (int)$route['required_evaluators'];
    $route['is_active'] = (bool)$route['is_active'];
    $route['evaluators'] = $members->fetchAll();
    sendResponse(200, $route);
}

if ($method !== 'PUT') sendResponse(405, [], 'Method not allowed.');
if ($actor['role'] !== 'ADMINISTRATOR') sendResponse(403, [], 'Only an Administrator can change evaluation routing.');
$data = getJsonInput();
$count = filter_var($data['required_evaluators'] ?? null, FILTER_VALIDATE_INT);
$ids = $data['evaluator_ids'] ?? null;
$active = !array_key_exists('is_active', $data) || (bool)$data['is_active'];
if (!$count || $count < 1 || $count > 100 || !is_array($ids) || count($ids) !== $count || count(array_unique($ids)) !== $count) {
    sendResponse(400, [], 'Select exactly the required number of distinct evaluators (1–100).');
}
foreach ($ids as $id) {
    if (!is_string($id) || $id === '') sendResponse(400, [], 'Each evaluator selection is required.');
}
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$valid = $db->prepare("SELECT COUNT(*) FROM profiles WHERE role = 'EVALUATOR' AND is_active = 1 AND id IN ($placeholders)");
$valid->execute($ids);
if ((int)$valid->fetchColumn() !== $count) sendResponse(400, [], 'All selected evaluators must have active evaluator accounts.');

try {
    $db->beginTransaction();
    $award = $db->prepare('SELECT id FROM awards WHERE id = :id FOR UPDATE');
    $award->execute([':id' => $awardId]);
    if (!$award->fetch()) {
        $db->rollBack();
        sendResponse(404, [], 'Award not found.');
    }
    $existing = $db->prepare('SELECT id FROM award_evaluation_routes WHERE award_id = :id');
    $existing->execute([':id' => $awardId]);
    $routeId = $existing->fetchColumn() ?: 'route-' . bin2hex(random_bytes(16));
    $save = $db->prepare('INSERT INTO award_evaluation_routes (id, award_id, required_evaluators, is_active) VALUES (:id, :award_id, :required, :active) ON DUPLICATE KEY UPDATE required_evaluators = VALUES(required_evaluators), is_active = VALUES(is_active)');
    $save->execute([':id' => $routeId, ':award_id' => $awardId, ':required' => $count, ':active' => $active ? 1 : 0]);
    // Route membership may change; application assignments remain a historical snapshot.
    $db->prepare('DELETE FROM award_route_evaluators WHERE route_id = :id')->execute([':id' => $routeId]);
    $insert = $db->prepare('INSERT INTO award_route_evaluators (id, route_id, evaluator_id, sequence_no) VALUES (:id, :route_id, :evaluator_id, :sequence_no)');
    foreach ($ids as $index => $id) {
        $insert->execute([':id' => 'rem-' . bin2hex(random_bytes(16)), ':route_id' => $routeId, ':evaluator_id' => $id, ':sequence_no' => $index + 1]);
    }
    $db->commit();
    sendResponse(200, ['id' => $routeId], 'Evaluation routing saved.');
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    sendInternalError($e, 'award_routes.php:save', 'Failed to save evaluation routing.');
}
