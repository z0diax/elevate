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

function replace_award_relations($db, string $awardId, array $criteria = [], array $documents = [], array $eligibility = []): void {
    $db->prepare("DELETE FROM award_criteria WHERE award_id = :award_id")->execute([':award_id' => $awardId]);
    $db->prepare("DELETE FROM award_document_requirements WHERE award_id = :award_id")->execute([':award_id' => $awardId]);
    $db->prepare("DELETE FROM award_eligibility_requirements WHERE award_id = :award_id")->execute([':award_id' => $awardId]);

    if (!empty($criteria)) {
        $stmt = $db->prepare("
            INSERT INTO award_criteria (id, award_id, criterion_name, criterion_description, weight_percentage, max_score)
            VALUES (:id, :award_id, :criterion_name, :criterion_description, :weight_percentage, :max_score)
        ");
        foreach ($criteria as $index => $criterion) {
            $stmt->execute([
                ':id' => $criterion['id'] ?? ('crit-' . $awardId . '-' . ($index + 1)),
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
                ':id' => $document['id'] ?? ('dreq-' . $awardId . '-' . ($index + 1)),
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
                ':id' => $requirement['id'] ?? ('elig-' . $awardId . '-' . ($index + 1)),
                ':award_id' => $awardId,
                ':requirement_description' => $requirement['requirement_description'] ?? 'Eligibility requirement',
                ':is_mandatory' => !empty($requirement['is_mandatory']) ? 1 : 0,
                ':order_index' => (int)($requirement['order_index'] ?? ($index + 1)),
            ]);
        }
    }
}

function validate_award_payload(array $data, bool $requireCriteria = false): void {
    if (isset($data['award_year']) && (!is_numeric($data['award_year']) || (int)$data['award_year'] < 2020 || (int)$data['award_year'] > 2100)) {
        sendResponse(400, [], 'Award year must be between 2020 and 2100.');
    }

    if (isset($data['min_qualifying_score']) && (!is_numeric($data['min_qualifying_score']) || (float)$data['min_qualifying_score'] < 0 || (float)$data['min_qualifying_score'] > 100)) {
        sendResponse(400, [], 'Minimum qualifying score must be between 0 and 100.');
    }

    if (!array_key_exists('criteria', $data)) {
        if ($requireCriteria) {
            sendResponse(400, [], 'At least one evaluation criterion is required.');
        }
    } else {
        if (!is_array($data['criteria']) || empty($data['criteria'])) {
            sendResponse(400, [], 'At least one evaluation criterion is required.');
        }

        $totalWeight = 0.0;
        foreach ($data['criteria'] as $criterion) {
            if (!is_array($criterion) || trim((string)($criterion['criterion_name'] ?? '')) === '') {
                sendResponse(400, [], 'Each evaluation criterion must have a name.');
            }

            $weight = $criterion['weight_percentage'] ?? null;
            if (!is_numeric($weight) || (float)$weight < 0 || (float)$weight > 100) {
                sendResponse(400, [], 'Each criterion weight must be between 0 and 100.');
            }
            $totalWeight += (float)$weight;
        }

        if (abs($totalWeight - 100) > 0.01) {
            sendResponse(400, [], 'Criterion weights must total exactly 100%.');
        }
    }

    if (array_key_exists('document_requirements', $data)) {
        if (!is_array($data['document_requirements'])) {
            sendResponse(400, [], 'Document requirements must be a list.');
        }

        foreach ($data['document_requirements'] as $requirement) {
            if (!is_array($requirement) || trim((string)($requirement['document_name'] ?? '')) === '') {
                sendResponse(400, [], 'Each attachment requirement must have a document name.');
            }
        }
    }
}

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $award = getFullAward($db, (string)$_GET['id']);
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
            ':is_on_the_spot' => !empty($data['is_on_the_spot']) ? 1 : 0,
            ':is_active' => !isset($data['is_active']) || $data['is_active'] ? 1 : 0,
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
            ':is_on_the_spot' => array_key_exists('is_on_the_spot', $data) ? (!empty($data['is_on_the_spot']) ? 1 : 0) : null,
            ':is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : null,
        ]);

        if (array_key_exists('criteria', $data) || array_key_exists('document_requirements', $data) || array_key_exists('eligibility_requirements', $data)) {
            replace_award_relations(
                $db,
                $data['id'],
                $data['criteria'] ?? [],
                $data['document_requirements'] ?? [],
                $data['eligibility_requirements'] ?? []
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
    $awardId = (string)($_GET['id'] ?? ($data['id'] ?? ''));

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
