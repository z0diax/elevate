<?php
declare(strict_types=1);

/**
 * Awards, criteria, eligibility, and documentary requirements API.
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

function normalize_award(array $award): array {
    $award['is_active'] = (bool)$award['is_active'];
    $award['is_on_the_spot'] = (bool)($award['is_on_the_spot'] ?? false);
    $award['min_qualifying_score'] = (float)$award['min_qualifying_score'];
    $award['award_year'] = (int)$award['award_year'];
    return $award;
}

function getFullAward($db, string $awardId): ?array {
    $stmt = $db->prepare("SELECT * FROM awards WHERE id = :id");
    $stmt->execute([':id' => $awardId]);
    $award = $stmt->fetch();
    if (!$award) {
        return null;
    }

    $award = normalize_award($award);

    $critStmt = $db->prepare("SELECT * FROM award_criteria WHERE award_id = :id ORDER BY created_at ASC");
    $critStmt->execute([':id' => $awardId]);
    $criteria = $critStmt->fetchAll();
    foreach ($criteria as &$criterion) {
        $criterion['weight_percentage'] = (float)$criterion['weight_percentage'];
        $criterion['max_score'] = (float)$criterion['max_score'];
    }
    $award['criteria'] = $criteria;

    $docStmt = $db->prepare("SELECT * FROM award_document_requirements WHERE award_id = :id ORDER BY created_at ASC");
    $docStmt->execute([':id' => $awardId]);
    $docs = $docStmt->fetchAll();
    foreach ($docs as &$doc) {
        $doc['is_mandatory'] = (bool)$doc['is_mandatory'];
    }
    $award['document_requirements'] = $docs;

    $eligStmt = $db->prepare("SELECT * FROM award_eligibility_requirements WHERE award_id = :id ORDER BY order_index ASC");
    $eligStmt->execute([':id' => $awardId]);
    $eligibility = $eligStmt->fetchAll();
    foreach ($eligibility as &$requirement) {
        $requirement['is_mandatory'] = (bool)$requirement['is_mandatory'];
        $requirement['order_index'] = (int)$requirement['order_index'];
    }
    $award['eligibility_requirements'] = $eligibility;

    return $award;
}

function replace_award_relations($db, string $awardId, ?array $criteria = null, ?array $documents = null, ?array $eligibility = null): void {
    if ($criteria !== null) $db->prepare("DELETE FROM award_criteria WHERE award_id = :award_id")->execute([':award_id' => $awardId]);
    if ($documents !== null) $db->prepare("DELETE FROM award_document_requirements WHERE award_id = :award_id")->execute([':award_id' => $awardId]);
    if ($eligibility !== null) $db->prepare("DELETE FROM award_eligibility_requirements WHERE award_id = :award_id")->execute([':award_id' => $awardId]);

    if (!empty($criteria)) {
        $stmt = $db->prepare("
            INSERT INTO award_criteria (id, award_id, criterion_name, criterion_description, weight_percentage, max_score)
            VALUES (:id, :award_id, :criterion_name, :criterion_description, :weight_percentage, :max_score)
        ");
        foreach ($criteria as $index => $criterion) {
            $stmt->execute([
                ':id' => 'crit-' . bin2hex(random_bytes(16)),
                ':award_id' => $awardId,
                ':criterion_name' => $criterion['criterion_name'] ?? 'Criterion',
                ':criterion_description' => $criterion['criterion_description'] ?? '',
                ':weight_percentage' => (float)($criterion['weight_percentage'] ?? 0),
                ':max_score' => (float)($criterion['max_score'] ?? 100),
            ]);
        }
    }

    if (!empty($documents)) {
        $stmt = $db->prepare("
            INSERT INTO award_document_requirements (id, award_id, document_name, description, is_mandatory)
            VALUES (:id, :award_id, :document_name, :description, :is_mandatory)
        ");
        foreach ($documents as $index => $document) {
            $stmt->execute([
                ':id' => 'dreq-' . bin2hex(random_bytes(16)),
                ':award_id' => $awardId,
                ':document_name' => $document['document_name'] ?? 'Document Requirement',
                ':description' => $document['description'] ?? '',
                ':is_mandatory' => !empty($document['is_mandatory']) ? 1 : 0,
            ]);
        }
    }

    if (!empty($eligibility)) {
        $stmt = $db->prepare("
            INSERT INTO award_eligibility_requirements (id, award_id, requirement_description, is_mandatory, order_index)
            VALUES (:id, :award_id, :requirement_description, :is_mandatory, :order_index)
        ");
        foreach ($eligibility as $index => $requirement) {
            $stmt->execute([
                ':id' => 'elig-' . bin2hex(random_bytes(16)),
                ':award_id' => $awardId,
                ':requirement_description' => $requirement['requirement_description'] ?? 'Eligibility requirement',
                ':is_mandatory' => !empty($requirement['is_mandatory']) ? 1 : 0,
                ':order_index' => (int)($requirement['order_index'] ?? ($index + 1)),
            ]);
        }
    }
}

function validate_award_payload(array $data, bool $requireCriteria = false): void {
    requireFields($data, ['id', 'name', 'code', 'description', 'remarks', 'award_year', 'min_qualifying_score', 'is_on_the_spot', 'is_active', 'criteria', 'document_requirements', 'eligibility_requirements']);
    if (isset($data['id'])) requireId($data['id'], 'award ID');
    foreach (['name' => 255, 'code' => 50, 'description' => 65535, 'remarks' => 65535] as $field => $max) if (isset($data[$field])) requireText($data[$field], $field, $max, $field === 'name' || $field === 'code');
    if (isset($data['award_year'])) requireIntRange($data['award_year'], 'award year', 2020, 2100);
    if (isset($data['min_qualifying_score'])) requireDecimal($data['min_qualifying_score'], 'minimum qualifying score', 0, 100);
    foreach (['is_on_the_spot', 'is_active'] as $field) if (array_key_exists($field, $data)) requireBool($data[$field], $field);

    if (!array_key_exists('criteria', $data)) {
        if ($requireCriteria) {
            sendResponse(400, [], 'At least one evaluation criterion is required.');
        }
    } else {
        if (!is_array($data['criteria']) || !array_is_list($data['criteria']) || empty($data['criteria']) || count($data['criteria']) > 100) {
            sendResponse(400, [], 'At least one evaluation criterion is required.');
        }

        $totalWeight = 0.0;
        foreach ($data['criteria'] as $criterion) {
            if (!is_array($criterion)) sendResponse(400, [], 'Invalid criterion.');
            requireFields($criterion, ['criterion_name', 'criterion_description', 'weight_percentage', 'max_score']);
            requireText($criterion['criterion_name'] ?? null, 'criterion name', 255, true);
            if (isset($criterion['criterion_description'])) requireText($criterion['criterion_description'], 'criterion description', 65535);

            $weight = $criterion['weight_percentage'] ?? null;
            requireDecimal($weight, 'criterion weight', 0, 100);
            if (isset($criterion['max_score'])) requireDecimal($criterion['max_score'], 'maximum score', 0.01, 100);
            $totalWeight += (float)$weight;
        }

        if (abs($totalWeight - 100) > 0.01) {
            sendResponse(400, [], 'Criterion weights must total exactly 100%.');
        }
    }

    if (array_key_exists('document_requirements', $data)) {
        if (!is_array($data['document_requirements']) || !array_is_list($data['document_requirements']) || count($data['document_requirements']) > 100) {
            sendResponse(400, [], 'Document requirements must be a list.');
        }

        foreach ($data['document_requirements'] as $requirement) {
            if (!is_array($requirement)) sendResponse(400, [], 'Invalid document requirement.');
            requireFields($requirement, ['document_name', 'description', 'is_mandatory']);
            requireText($requirement['document_name'] ?? null, 'document name', 255, true);
            if (isset($requirement['description'])) requireText($requirement['description'], 'description', 65535);
            if (isset($requirement['is_mandatory'])) requireBool($requirement['is_mandatory'], 'is_mandatory');
        }
    }
    if (isset($data['eligibility_requirements'])) {
        if (!is_array($data['eligibility_requirements']) || !array_is_list($data['eligibility_requirements']) || count($data['eligibility_requirements']) > 100) sendResponse(400, [], 'Invalid eligibility requirements.');
        foreach ($data['eligibility_requirements'] as $requirement) {
            if (!is_array($requirement)) sendResponse(400, [], 'Invalid eligibility requirement.');
            requireFields($requirement, ['requirement_description', 'is_mandatory', 'order_index']);
            requireText($requirement['requirement_description'] ?? null, 'requirement description', 65535, true);
            if (isset($requirement['is_mandatory'])) requireBool($requirement['is_mandatory'], 'is_mandatory');
            if (isset($requirement['order_index'])) requireIntRange($requirement['order_index'], 'order index', 0, 10000);
        }
    }
}

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $award = getFullAward($db, requireId($_GET['id'], 'award ID'));
        if (!$award) {
            sendResponse(404, [], 'Award not found.');
        }
        sendResponse(200, $award);
    }

    $stmt = $db->query("SELECT id FROM awards WHERE is_active = 1 ORDER BY created_at ASC");
    $awards = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $awardId) {
        $award = getFullAward($db, (string)$awardId);
        if ($award) {
            $awards[] = $award;
        }
    }

    sendResponse(200, $awards);
}

if ($method === 'POST') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    if (empty($data['name']) || empty($data['code'])) {
        sendResponse(400, [], 'Name and code are required.');
    }
    validate_award_payload($data, true);

    $id = 'awd-' . time() . '-' . rand(10, 99);
    $db->beginTransaction();

    try {
        $stmt = $db->prepare("
            INSERT INTO awards (id, name, code, description, remarks, award_year, min_qualifying_score, is_on_the_spot, is_active)
            VALUES (:id, :name, :code, :description, :remarks, :award_year, :min_qualifying_score, :is_on_the_spot, :is_active)
        ");
        $stmt->execute([
            ':id' => $id,
            ':name' => $data['name'],
            ':code' => $data['code'],
            ':description' => $data['description'] ?? '',
            ':remarks' => $data['remarks'] ?? '',
            ':award_year' => (int)($data['award_year'] ?? date('Y')),
            ':min_qualifying_score' => (float)($data['min_qualifying_score'] ?? 85),
            ':is_on_the_spot' => isset($data['is_on_the_spot']) && requireBool($data['is_on_the_spot'], 'is_on_the_spot') ? 1 : 0,
            ':is_active' => !isset($data['is_active']) || requireBool($data['is_active'], 'is_active') ? 1 : 0,
        ]);

        replace_award_relations(
            $db,
            $id,
            $data['criteria'] ?? [],
            $data['document_requirements'] ?? [],
            $data['eligibility_requirements'] ?? []
        );

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'awards.php:create', 'Failed to create award.');
    }

    sendResponse(201, getFullAward($db, $id), 'Award created.');
}

if ($method === 'PUT') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    if (empty($data['id'])) {
        sendResponse(400, [], 'Award id is required.');
    }
    requireId($data['id'], 'award ID');
    if (!getFullAward($db, (string)$data['id'])) {
        sendResponse(404, [], 'Award not found.');
    }
    validate_award_payload($data);

    $db->beginTransaction();

    try {
        $stmt = $db->prepare("
            UPDATE awards SET
                name = COALESCE(:name, name),
                code = COALESCE(:code, code),
                description = COALESCE(:description, description),
                remarks = COALESCE(:remarks, remarks),
                award_year = COALESCE(:award_year, award_year),
                min_qualifying_score = COALESCE(:min_qualifying_score, min_qualifying_score),
                is_on_the_spot = COALESCE(:is_on_the_spot, is_on_the_spot),
                is_active = COALESCE(:is_active, is_active)
            WHERE id = :id
        ");
        $stmt->execute([
            ':id' => $data['id'],
            ':name' => $data['name'] ?? null,
            ':code' => $data['code'] ?? null,
            ':description' => $data['description'] ?? null,
            ':remarks' => $data['remarks'] ?? null,
            ':award_year' => isset($data['award_year']) ? (int)$data['award_year'] : null,
            ':min_qualifying_score' => isset($data['min_qualifying_score']) ? (float)$data['min_qualifying_score'] : null,
            ':is_on_the_spot' => array_key_exists('is_on_the_spot', $data) ? (requireBool($data['is_on_the_spot'], 'is_on_the_spot') ? 1 : 0) : null,
            ':is_active' => array_key_exists('is_active', $data) ? (requireBool($data['is_active'], 'is_active') ? 1 : 0) : null,
        ]);

        if (array_key_exists('criteria', $data) || array_key_exists('document_requirements', $data) || array_key_exists('eligibility_requirements', $data)) {
            replace_award_relations(
                $db,
                $data['id'],
                $data['criteria'] ?? null,
                $data['document_requirements'] ?? null,
                $data['eligibility_requirements'] ?? null
            );
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'awards.php:update', 'Failed to update award.');
    }

    sendResponse(200, getFullAward($db, (string)$data['id']), 'Award updated.');
}

if ($method === 'DELETE') {
    require_auth($db, ['ADMINISTRATOR']);
    $data = getJsonInput();
    $awardId = requireId($_GET['id'] ?? ($data['id'] ?? null), 'award ID');

    if ($awardId === '') {
        sendResponse(400, [], 'Award id is required for deletion.');
    }

    $award = getFullAward($db, $awardId);
    if (!$award) {
        sendResponse(404, [], 'Award not found.');
    }

    $applicationCount = $db->prepare('SELECT COUNT(*) FROM applications WHERE award_id = :award_id');
    $applicationCount->execute([':award_id' => $awardId]);
    if ((int)$applicationCount->fetchColumn() > 0) {
        sendResponse(409, [], 'Cannot delete an award that is linked to nomination records.');
    }

    $db->beginTransaction();
    try {
        // Linked criteria, eligibility, and document requirements are removed by database cascades.
        $db->prepare('DELETE FROM awards WHERE id = :id')->execute([':id' => $awardId]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'awards.php:delete', 'Failed to delete award.');
    }

    sendResponse(200, ['id' => $awardId], 'Award deleted successfully.');
}

sendResponse(405, [], 'Method not allowed.');
