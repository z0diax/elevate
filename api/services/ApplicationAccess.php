<?php
declare(strict_types=1);

function canViewApplication(array $application, array $actor): bool {
    $role = $actor['role'] ?? '';

    // Incomplete upload drafts are visible only to the filer who can resume them.
    if ($application['status'] === 'Draft') {
        return (string)($application['nominator_id'] ?? '') === (string)($actor['id'] ?? '');
    }

    if ($role === 'ADMINISTRATOR') {
        return true;
    }

    if ($role === 'EVALUATOR') {
        if (!empty($application['evaluator_assignments'])) {
            foreach ($application['evaluator_assignments'] as $assignment) {
                if ($assignment['evaluator_id'] === $actor['id'] && $assignment['status'] !== 'Reassigned') return true;
            }
            return false;
        }
        // Legacy applications without assignment rows retain their JSON assignment list.
        return in_array($actor['id'], $application['assigned_evaluators'] ?? [], true);
    }

    // A filer must retain read-only visibility of their own nomination throughout
    // the workflow, even after it moves beyond their operational workbench.
    if ((string)($application['nominator_id'] ?? '') === (string)($actor['id'] ?? '')
        || (string)($application['nominee_id'] ?? '') === (string)($actor['id'] ?? '')) {
        return true;
    }

    if ($role === 'SECRETARIAT') {
        // Secretariat remains assigned from document verification onward.
        return in_array($application['processing_stage'],
            ['Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded'], true);
    }

    if ($role === 'HEAD_OF_OFFICE') {
        return !empty($actor['office_id']) && $application['office_id'] === $actor['office_id'];
    }

    return false;
}
