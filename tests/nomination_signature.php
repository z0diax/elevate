<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/services/NominationSignature.php';
$checks = 0;
$valid = [[[0.1, 0.2], [0.4, 0.8], [0.9, 0.1]]];
if (validate_signature_strokes($valid) !== $valid) throw new RuntimeException('Signature changed.');
$checks++;
foreach ([null, [], 'data:image/png;base64,forged', [[[0.1, 0.1]]], [[[0.1, 0.1], [0.1, 0.1]]], [[[0, 0], [2, 1]]], [[['0', 0], [1, 1]]], [[[0, 0], [INF, 1]]], [array_fill(0, 10001, [0.1, 0.1])], array_fill(0, 101, [[0, 0], [1, 1]])] as $invalid) {
    try { validate_signature_strokes($invalid); }
    catch (InvalidArgumentException $error) { $checks++; continue; }
    throw new RuntimeException('Invalid signature accepted.');
}
$application = ['nominator_id' => 'jack', 'nominator_name' => 'Jack', 'nominating_office' => 'HR', 'signature_signed_at' => '2026-10-08', 'submission_account_name' => 'Jack', 'nominee_name' => 'Jane', 'nomination_origin' => 'Nominated by Others'];
$redacted = redact_nominator_for_evaluator($application, ['role' => 'EVALUATOR']);
if (isset($redacted['nominator_id']) || isset($redacted['nominator_name']) || isset($redacted['signature_signed_at']) || isset($redacted['submission_account_name']) || $redacted['nominee_name'] !== 'Jane') throw new RuntimeException('Evaluator privacy failed.');
$checks++;
if (redact_nominator_for_evaluator($application, ['role' => 'SECRETARIAT']) !== $application) throw new RuntimeException('Review identity lost.');
$checks++;
if (nomination_signature_digest('[[[0,0],[1,1]]]', '{"a":1,"b":2}') !== nomination_signature_digest(' [ [ [0, 0], [1, 1] ] ] ', '{"b":2,"a":1}')) throw new RuntimeException('JSON storage normalization breaks integrity checks.');
$checks++;
if (nomination_signature_digest('[[[0,0],[1,1]]]', '{"a":1}') === nomination_signature_digest('[[[0,0],[1,0]]]', '{"a":1}')) throw new RuntimeException('Signature alteration was undetected.');
$checks++;
echo "Passed {$checks} signature validation and visibility checks.\n";
