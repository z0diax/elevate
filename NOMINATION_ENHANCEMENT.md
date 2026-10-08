# Nomination enhancement implementation

Implemented in the existing React/TypeScript/PHP/MySQL application. No roles, award configuration, or unrelated modules were redesigned. No dependencies were added and no commit or push was made.

## Workflow

1. Select the award and fill the dedicated Nominator Information section. The displayed name is prefilled from the signed-in profile and can be corrected. Select the nominator office from the active office directory and retain the position/designation.
2. Enter the separate nominee information and office. For an individual self-nomination, explicitly select the self-nomination checkbox; the server links the nominee to the authenticated account and uses its profile name. Other-person nominations in the wizard use an unlinked nominee identity. The backend also accepts an explicit active nominee account ID, validates it, and obtains the nominee name from that account.
3. Provide the existing merits/narrative and upload the award's existing documentary requirements.
4. Review the nominee, nominator, office, origin, and filing account. Draw, clear, redraw, and preview a personal handwritten signature. Explicitly confirm personal signing before final submission.
5. The existing resumable upload draft is created and attachments uploaded. Once a server draft exists, its form fields are retained and restored from the server so the review reflects the record being signed. Attachments can still be retried. The signature is kept in memory and must be redrawn after reopening the form.
6. Finalization validates required uploads and the signature, records the signed snapshot and audit entries atomically, and sends the nomination to the head of the **nominee's** office. Existing Secretariat verification, evaluator routing, scoring/revisions, deliberation, notifications, and award decisions continue.

## Identity and historical compatibility

`nominator_id` remains the original authenticated filing account; clients cannot choose or override it. Entered nominator details are separate from server-derived filing-account name and role snapshots. The additional name/role fields preserve the account's filing-time presentation without adding another account-ID field.

`nomination_type` still means Individual or Group / Team. The new `nomination_origin` is independent. Self-Nominated requires an explicit individual self-nomination linked to the authenticated account. A different linked account or an unlinked other-person identity is Nominated by Others. Names are never compared to infer account relationships. Group self-nomination is rejected.

Unsigned historical server drafts can resume and sign their original form without inventing an origin or nominator office ID. Historical origins, office IDs, filing-account presentation snapshots, and signatures stay NULL unless actually recorded. Existing potentially incorrect nominee links are not automatically rewritten. Historical details show the original filing account ID when a name/role snapshot is unavailable, and explicitly identify an unrecorded origin/signature.

## Signature storage and access

The native pointer/canvas pad supports mouse, touch, and stylus input. It sends bounded normalized handwritten paths, not client-provided image files or executable SVG. Server checks require a real nonzero path, personal confirmation, valid finite coordinates, at most 100 strokes/10,000 points, and a 250,000-byte path limit. The existing JSON endpoint also enforces a 1 MB request limit.

`nomination_signatures` privately stores one immutable signed record per application: authenticated signer ID, path JSON, the signed nomination snapshot, attachment SHA-256 digests, an integrity digest, and the server timestamp. The digest uses canonical decoded JSON so MySQL JSON normalization does not invalidate it. This is an integrity check, not a certificate-backed digital signature.

Signing occurs under an application row lock and in the submission transaction. Uploads acquire the same application lock and recheck eligibility, preventing an upload that started earlier from changing attachments after signing. Duplicate finalization is idempotent; it does not replace the signature. There is no signature update endpoint. Returned-document resubmission adds audit history and preserves the original signature/snapshot/timestamp; it does not claim the original signature covers replacement attachment contents. A future form correction/re-signing workflow would need explicit versioning and is not implemented.

`GET api/applications.php?action=signature&id=...` requires an authenticated account with existing application visibility, rejects evaluator access, verifies integrity, and uses `Cache-Control: private, no-store`. Paths are only fetched in authorized detail views and PDF generation. There are no public signature-image URLs. Application responses and filing-account audit attribution are redacted for evaluators. Existing attached documents may themselves contain identifying content; this does not implement completely anonymous scoring.

Lists show compact nominator information and origin badges. Details show entered nominator information, filing-account presentation, and the signature. Form A1 renders the signed form identity/narrative and an explicitly labeled nominator signature/date block, while retaining configured prepared/verified/confirmed official areas and current review status. Certificates and other reports are unchanged.

## Database upgrade

Apply `database_migrations/20261008_nomination_identity_signatures.sql` **once** to existing deployments before using the updated API. It adds four nullable application columns and the signature table; it performs no record updates or deletions. Fresh installations use the updated `database.sql`. Runtime APIs do not execute DDL.

The migration was applied to the local XAMPP database. Its one existing nomination was compared before/after across every original column and remained unchanged. Repository retrieval and original-filer access were also checked successfully. A separate automated migration check verifies historical preservation and that origin remains unknown, even when old nominee/nominator IDs coincide.

## Files

Created:

- `api/services/NominationSignature.php`
- `database_migrations/20261008_nomination_identity_signatures.sql`
- `src/components/nomination/SignaturePad.tsx`
- `src/components/nomination/NominationIdentity.tsx`
- `tests/nomination_signature.php`
- `tests/nomination_identity_migration.php`
- `tests/nomination_browser.mjs`
- `tests/nomination_browser_fixture.tsx`
- `NOMINATION_ENHANCEMENT.md`

Modified:

- `api/applications.php`, `api/audit_logs.php`, `api/documents.php`
- `api/services/ApplicationService.php`, `api/services/ApplicationRepository.php`
- `database.sql`, `package.json`
- `src/types.ts`, `src/lib/nominationDraft.ts`, `src/lib/pdfGenerator.ts`
- `src/lib/api/applicationsApi.ts`, `src/lib/api/normalizers.ts`
- `src/components/nomination/NominationWizard.tsx`, `SubmitNominationView.tsx`, `NominationQueueCards.tsx`, `NominationReadOnlySections.tsx`
- `src/components/dashboards/AdminDashboard.tsx`, `DeliberationDashboard.tsx`, `HeadOfOfficeDashboard.tsx`, `NomineeDashboard.tsx`, `SecretariatDashboard.tsx`
- `tests/integration.mjs`, `tests/integration_db.php`, `tests/README.md`

## Validation

- TypeScript check and production build passed. Vite reports its large-bundle advisory.
- Unit suite passed, including 15 signature validation/visibility/digest checks, existing PHP authorization/schema checks, and 9 TypeScript tests.
- 23 API integration groups passed, including registration and signed submission, different offices, self and unlinked/linked nominees, account spoofing, inactive offices, unsigned/blank/unconfirmed signing, unauthorized access, idempotent signing, preserved signatures after document revision, evaluator privacy, scoring/revisions, and final decisions.
- 20 existing MySQL reassignment transaction scenarios passed.
- Separate legacy migration test passed.
- Real headless Chromium test passed: mouse/touch/stylus drawing, clear/redraw, unsigned blocking, mobile form width, distinct offices, and generated signed Form A1. The mobile review screenshot and rendered PDF signature page were visually inspected.
- PHP syntax and `git diff --check` passed.

## Limits and decisions

Self-registration and a drawn signature establish a session-associated declaration; they do not independently verify a person's real-world identity or establish legal/certificate compliance. Other-person nominees remain unlinked in the wizard; an account-search/linking UI was not added. The existing document-replacement workflow remains available, with the original signed attachment digests retained. No client approval is needed for completed changes; future identity verification, linking UI, and versioned re-signing are separate product decisions.
