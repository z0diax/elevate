<?php
declare(strict_types=1);

function getFullApplication(PDO $db, string $appId): ?array {
    $stmt = $db->prepare("SELECT id, application_number, award_id, award_name, award_year,
        nominee_id, nominee_name, employee_id, position_title, office_id, office_name,
        division_section, employment_category, contact_number, email, barangay,
        nomination_type, nominator_id, nominator_name, nominator_position,
        nominating_office, justification, accomplishments, supporting_narrative,
        date_of_nomination, status, processing_stage, required_action, remarks,
        final_weighted_score, deliberation_remarks, deliberation_decision,
        deliberation_date, award_date, created_at, updated_at
        FROM applications WHERE id = :id");
    $stmt->execute([':id' => $appId]);
    $app = $stmt->fetch();

    if (!$app) {
        return null;
    }

    $app['award_year'] = (int)$app['award_year'];
    $app['final_weighted_score'] = $app['final_weighted_score'] !== null ? (float)$app['final_weighted_score'] : null;
    $assignmentStmt = $db->prepare("SELECT aea.*, p.full_name AS evaluator_name FROM application_evaluator_assignments aea JOIN profiles p ON p.id = aea.evaluator_id WHERE aea.application_id = :id ORDER BY aea.sequence_no, aea.assigned_at");
    $assignmentStmt->execute([':id' => $appId]);
    $app['evaluator_assignments'] = $assignmentStmt->fetchAll();

    $docStmt = $db->prepare("SELECT * FROM application_documents WHERE application_id = :id ORDER BY uploaded_at ASC");
    $docStmt->execute([':id' => $appId]);
    $documents = $docStmt->fetchAll();
    foreach ($documents as &$document) {
        $document['file_size'] = $document['file_size'] !== null ? (int)$document['file_size'] : null;
        $document['file_url'] = $document['file_url'] !== '' ? public_document_url((string)$document['id']) : '';
    }
    $app['documents'] = $documents;

    $endStmt = $db->prepare("SELECT * FROM endorsements WHERE application_id = :id ORDER BY created_at DESC LIMIT 1");
    $endStmt->execute([':id' => $appId]);
    $app['endorsement'] = $endStmt->fetch() ?: null;

    $evalStmt = $db->prepare("SELECT * FROM evaluations WHERE application_id = :id ORDER BY created_at ASC");
    $evalStmt->execute([':id' => $appId]);
    $evaluations = $evalStmt->fetchAll();

    foreach ($evaluations as &$evaluation) {
        $evaluation['total_raw_score'] = (float)$evaluation['total_raw_score'];
        $evaluation['weighted_percentage'] = (float)$evaluation['weighted_percentage'];
        $evaluation['total_score'] = (float)$evaluation['weighted_percentage'];
        $evaluation['is_submitted'] = (bool)$evaluation['is_submitted'];
        $evaluation['version_number'] = (int)$evaluation['version_number'];
        $evaluation['revision_count'] = $evaluation['version_number'] - 1;

        $scoreStmt = $db->prepare("SELECT * FROM evaluation_scores WHERE evaluation_id = :eval_id ORDER BY created_at ASC");
        $scoreStmt->execute([':eval_id' => $evaluation['id']]);
        $scores = $scoreStmt->fetchAll();
        foreach ($scores as &$score) {
            $score['weight_percentage'] = (float)$score['weight_percentage'];
            $score['max_score'] = (float)$score['max_score'];
            $score['score'] = (float)$score['score'];
            $score['weighted_score'] = isset($score['weighted_score']) ? (float)$score['weighted_score'] : 0.0;
            $score['raw_score'] = (float)$score['score'];
            $score['evaluator_remarks'] = $score['remarks'] ?? '';
        }
        $evaluation['scores'] = $scores;
    }
    $app['evaluations'] = $evaluations;
    $app['stage'] = $app['processing_stage'];

    return $app;
}

function findSubmittedNomination(PDO $db, string $appId, array $actor, array $data): ?array {
    $stmt = $db->prepare('SELECT nominator_id, award_id, nominee_name, office_id FROM applications WHERE id = :id');
    $stmt->execute([':id' => $appId]);
    $existing = $stmt->fetch();
    if (!$existing) {
        return null;
    }

    if ((string)$existing['nominator_id'] !== (string)$actor['id']
        || (string)$existing['award_id'] !== (string)$data['award_id']
        || (string)$existing['nominee_name'] !== trim((string)$data['nominee_name'])
        || (string)$existing['office_id'] !== (string)$data['office_id']) {
        sendResponse(409, [], 'This submission ID already belongs to another nomination.');
    }

    return getFullApplication($db, $appId);
}

function listApplications(PDO $db, array $actor): array {
    $role = $actor['role'];
    if ($role === 'ADMINISTRATOR') {
        $stmt = $db->prepare('SELECT id FROM applications ORDER BY created_at DESC');
        $stmt->execute();
    } elseif ($role === 'EVALUATOR') {
        $stmt = $db->prepare("SELECT a.id FROM applications a WHERE a.status <> 'Draft' AND EXISTS (SELECT 1 FROM application_evaluator_assignments x WHERE x.application_id = a.id AND x.evaluator_id = :id AND x.status <> 'Reassigned') ORDER BY a.created_at DESC");
        $stmt->execute([':id' => $actor['id']]);
    } elseif ($role === 'SECRETARIAT') {
        $stmt = $db->prepare("SELECT id FROM applications WHERE processing_stage IN ('Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded') AND status <> 'Draft' ORDER BY created_at DESC");
        $stmt->execute();
    } elseif ($role === 'HEAD_OF_OFFICE') {
        $stmt = $db->prepare("SELECT id FROM applications WHERE nominator_id = :id OR nominee_id = :nominee_id OR (office_id = :office_id AND status <> 'Draft') ORDER BY created_at DESC");
        $stmt->execute([':id' => $actor['id'], ':nominee_id' => $actor['id'], ':office_id' => $actor['office_id'] ?? '']);
    } else {
        $stmt = $db->prepare('SELECT id FROM applications WHERE nominator_id = :id OR nominee_id = :nominee_id ORDER BY created_at DESC');
        $stmt->execute([':id' => $actor['id'], ':nominee_id' => $actor['id']]);
    }
    $results = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $application = getFullApplication($db, (string)$id);
        if ($application && canViewApplication($application, $actor)) {
            $results[] = $application;
        }
    }

    return $results;
}
