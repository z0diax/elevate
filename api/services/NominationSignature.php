<?php
declare(strict_types=1);

// Normalized handwritten paths, never arbitrary image/SVG/HTML supplied by clients.
function validate_signature_strokes($strokes): array {
    if (!is_array($strokes) || !array_is_list($strokes) || count($strokes) < 1 || count($strokes) > 100) {
        throw new InvalidArgumentException('Draw your signature before submitting.');
    }
    $points = 0;
    $length = 0.0;
    foreach ($strokes as $stroke) {
        if (!is_array($stroke) || !array_is_list($stroke) || count($stroke) < 2) throw new InvalidArgumentException('Invalid signature stroke.');
        $previous = null;
        foreach ($stroke as $point) {
            if (++$points > 10000 || !is_array($point) || !array_is_list($point) || count($point) !== 2) throw new InvalidArgumentException('Signature is too large or invalid.');
            foreach ($point as $coordinate) {
                if ((!is_int($coordinate) && !is_float($coordinate)) || !is_finite((float)$coordinate) || $coordinate < 0 || $coordinate > 1) throw new InvalidArgumentException('Invalid signature coordinates.');
            }
            if ($previous !== null) $length += hypot($point[0] - $previous[0], $point[1] - $previous[1]);
            $previous = $point;
        }
    }
    if ($length < 0.05 || strlen(json_encode($strokes, JSON_THROW_ON_ERROR)) > 250000) throw new InvalidArgumentException('Draw a complete signature before submitting.');
    return $strokes;
}

function nomination_signature_digest(string $strokes, string $snapshot): string {
    // MySQL's JSON type can reorder object keys and whitespace on storage.
    // Hash decoded canonical data so verification also works on MySQL, not just MariaDB.
    $canonicalize = function ($value) use (&$canonicalize) {
        if (!is_array($value)) return $value;
        if (!array_is_list($value)) ksort($value, SORT_STRING);
        return array_map($canonicalize, $value);
    };
    $paths = $canonicalize(json_decode($strokes, true, 512, JSON_THROW_ON_ERROR));
    $record = $canonicalize(json_decode($snapshot, true, 512, JSON_THROW_ON_ERROR));
    return hash('sha256', json_encode([$paths, $record], JSON_THROW_ON_ERROR));
}

function redact_nominator_for_evaluator(array $application, array $actor): array {
    if (($actor['role'] ?? '') === 'EVALUATOR') {
        foreach (['nominator_id', 'nominator_name', 'nominator_position', 'nominating_office', 'nominating_office_id', 'submission_account_name', 'submission_account_role', 'signature_signed_at'] as $field) unset($application[$field]);
    }
    return $application;
}
