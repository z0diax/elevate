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

Unsigned historical server drafts can resume and sign their original form without inventing an origin or nominator office ID. Historical origins, office IDs, filing-account presentation snapshots, and original signatures stay NULL unless actually recorded. Existing potentially incorrect nominee links are not automatically rewritten. Historical details show the original filing account ID when a name/role snapshot is unavailable, and explicitly identify an unrecorded origin/signature.

## Signature storage and access

The native pointer/canvas pad supports mouse, touch, and stylus input. It sends bounded normalized handwritten paths, not client-provided image files or executable SVG. Server checks require a real nonzero path, personal confirmation, valid finite coordinates, at most 100 strokes/10,000 points, and a 250,000-byte path limit. The existing JSON endpoint also enforces a 1 MB request limit.

`nomination_signatures` privately stores the immutable signature from each original submission: authenticated signer ID, path JSON, the signed nomination snapshot, attachment SHA-256 digests, an integrity digest, and the server timestamp. The digest uses canonical decoded JSON so MySQL JSON normalization does not invalidate it. This is an integrity check, not a certificate-backed digital signature.

Signing occurs under an application row lock and in the submission transaction. Uploads acquire the same application lock and recheck eligibility, preventing an upload that started earlier from changing attachments after signing. Duplicate finalization is idempotent; it does not replace the signature. There is no signature update endpoint. Returned-document resubmission adds audit history and preserves the original signature/snapshot/timestamp; it does not claim the original signature covers replacement attachment contents. Administrator-required revisions use the versioned workflow below.

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

Self-registration and a drawn signature establish a session-associated declaration; they do not independently verify a person's real-world identity or establish legal/certificate compliance. Other-person nominees remain unlinked in the wizard; an account-search/linking UI was not added. The existing document-replacement workflow remains available, with the original signed attachment digests retained. Independent identity verification and a nominee account search remain separate product decisions.


## Administrator-required revisions

Administrators open **All Applications**, choose **Require Nomination Revision**, select a scope, enter instructions, and confirm. The nomination shows **Returned for Revision** and its existing stage remains visible while processing is suspended. Drafts, final deliberation decisions, approved and awarded nominations, and nominations with an active request are ineligible. An endorsement rejection remains eligible for correction.

The original filer receives an in-app link to the nomination and can open **Edit Nomination** from the submitted list or nomination viewer. The existing wizard loads the official form, award requirements, saved revision draft, and staged attachments. **Save & Close** saves details on the server. Files stage when selected and can be previewed before submission. Linked-account identity, original filer, application ID, application number, and self-nomination classification are fixed. An unlinked nominee's display name and other applicable details can be corrected within the authorized scope. A new award uses its own requirements. Details-only revisions that require changing attachments need a new authorization that includes attachments.

The filer reviews the revision and signs it personally. Finalization validates draft generation, scope, identity, requirements, and file hashes under the same application row lock used for workflow changes. It promotes staged files, records the new version and server signing timestamp, archives superseded decisions, and notifies the requesting Administrator and next processing personnel in one transaction. Details or combined revisions restart endorsement. For attachment-only revisions, a valid endorsement carries forward when the inspected attachments are unchanged. The Head of Office reviews every attachment under the current rules, so a changed set returns to endorsement. Evaluator assignments and scores are archived and excluded from active calculations.

An Administrator can cancel an active request with a reason. Cancellation validates and restores the prior workflow state, releases staged files, logs the action, and notifies the original filer. Active revision drafts can be resumed as long as the request remains active. Replaced, cancelled and unused staged files are cleaned up while finalized file bytes are retained. The existing chunked upload expiry also applies.

The form and PDF open the latest finalized version. Administrators can select historical versions, compare details and attachment changes, and view prior signatures and workflow decisions. Ordinary corrections can replace flagged rejected or missing attachments, including eligible endorsement rejections. Their replacement files are identified separately from the signed record, and the original signed bytes are accessible when the system still has them. Files deleted by older versions of the application cannot be reconstructed.

### API

All requests use the existing authenticated session. Mutations require the normal CSRF token.

| Endpoint | Access and behavior |
| --- | --- |
| `PUT applications.php?action=require_nomination_revision&id=?` | Administrator. Requires `scope` (`details`, `attachments`, or `both`) and nonblank `instructions`. |
| `PUT applications.php?action=cancel_nomination_revision&id=?` | Administrator. Requires the active `revision_id` and a nonblank `reason`. |
| `PUT applications.php?action=start_nomination_revision&id=?` | Original filer. Requires `revision_id`. Returns the official application and latest draft. |
| `PUT applications.php?action=save_nomination_revision&id=?` | Original filer. Requires `revision_id` and current `generation`. A `details` object requires details scope. The filer can save `remarks` with any scope. |
| `POST documents.php` and `uploads.php` | Original filer with attachment scope. Revision uploads include `revision_id`, `generation`, and `requirement_id`. The existing PDF, DOCX, JPG, JPEG, PNG and 10 MB rules apply. |
| `PUT applications.php?action=remove_revision_attachment&id=?` | Original filer with attachment scope. Requires `revision_id`, `generation`, and an optional `requirement_id` or the `document_id` of an unlinked legacy attachment. |
| `PUT applications.php?action=finalize_nomination_revision&id=?` | Original filer. Requires `revision_id`, `generation`, fresh `signature_strokes`, and `signature_confirmed`. Accepts `remarks`. |
| `GET applications.php?action=revision_history&id=?` | Administrator. Returns requests, historical version numbers, and archived attachment metadata. Existing form and signature actions accept `version` to select an authorized historical version. |
| `GET documents.php?action=download&id=?` | Standard access rules apply. Staged files are filer-only. Archived files are Administrator-only, except files covered by the current signature remain available to authorized, non-evaluator viewers of that signature. |

Revision actions return an `application` and a `draft` when the filer still has an active request. Mutations with a stale generation or a closed request return HTTP 409. Application reads include the current nomination version, the suspension flag, and role-appropriate revision or correction information. Reviewer actions and ordinary correction endpoints reject mutations during an active Administrator revision.

### Existing database rollout

Back up the database and private file storage, then apply `database_migrations/20261124_nomination_revisions.sql` once after the earlier migrations. For XAMPP, import this file into the existing application database in phpMyAdmin or run `SOURCE D:/xampp/htdocs/tacloban-praise/database_migrations/20261124_nomination_revisions.sql` from a MySQL client connected to the intended database. Apply it before serving the updated PHP code. Fresh installations use `database.sql`. No new environment settings are required.

Cloud import also transfers archived and staged attachment bytes and regenerates the active-request key on the destination. The migration adds five tables for requests, staged attachments, archived nomination and workflow snapshots, versioned signatures, and archived document versions. A generated-column unique index limits each application to one active request. Other keys constrain request numbering, draft attachment slots, and signed version numbers. It also adds a nullable original filename to document records and gives new endorsements microsecond timestamps. Existing signatures keep the original digest and timestamp, with unsigned records remaining unsigned.

Run `npm run build` and start Apache and MySQL for XAMPP, then open the project's local URL. Verify the flow with a test nomination, an Administrator, the original filer, and the assigned reviewer. The disposable migration test is `php tests/nomination_revision_migration.php`. Configure its empty test database as described in `tests/README.md`.


### Administrator revision files

| Created | Purpose |
| --- | --- |
| `api/services/NominationRevisionPolicy.php` | Eligibility, ownership, shared application locking, ordinary correction routing, and version lookup. |
| `api/services/NominationRevisionService.php` | Request lifecycle, staged data, versioned finalization, notifications, and workflow and attachment archives. |
| `database_migrations/20261124_nomination_revisions.sql` | Schema upgrade for existing application databases. |
| `src/components/nomination/NominationRevisionControls.tsx` | Administrator confirmation and cancellation dialogs, revision indicators, and instructions. |
| `src/components/nomination/NominationVersionHistory.tsx` | Administrator request history, signed version selection, comparisons, and archived workflow and attachment views. |
| `src/components/nomination/RevisionAttachmentList.tsx` | Scoped review, staging, replacement, and removal of supporting attachments. |
| `tests/nomination_revision_migration.php` | Dedicated database upgrade regression test. |

| Modified | Change |
| --- | --- |
| `api/applications.php`, `api/documents.php`, `api/uploads.php`, `api/evaluations.php` | Revision actions, versioned and integrity-checked reads, scoped uploads, workflow suspension, and ordinary correction enforcement. |
| `api/services/ApplicationService.php`, `ApplicationRepository.php`, `ApplicationPrivacy.php` | Correction routing, version metadata, privacy, and archive protection. |
| `api/services/DeliberationService.php`, `EndorsementService.php`, `EvaluationRoutingService.php`, `VerificationService.php` | Workflow locking and revision suspension checks. |
| `database.sql`, `scripts/cloud_database.php` | Fresh-install schema and cloud imports of staged and historical files. |
| `src/App.tsx`, `src/components/dashboards/AdminDashboard.tsx`, `AdminMobileLists.tsx`, `NomineeDashboard.tsx` | Notification navigation and role-appropriate entry points in desktop and mobile lists. |
| `src/components/nomination/NominationWizard.tsx`, `SubmitNominationView.tsx`, `NomineeTrackingModal.tsx`, `NominationQueueCards.tsx` | Prefilled wizard mode, server-backed draft resumption, scoped editing, re-signing, tracking, and correction actions. |
| `src/components/nomination/NominationActionModal.tsx`, `NominationFormViewerModal.tsx`, `NominationIdentity.tsx`, `DownloadNominationButton.tsx` | Suspension message, version-aware viewer, authenticated signature display, and PDF downloads. |
| `src/types.ts`, `src/lib/api/applicationsApi.ts`, `src/lib/api/normalizers.ts`, `src/lib/nominationPdf.ts` | Revision types and API calls, protected document URL resolution, and version-aware PDFs. |
| `tests/integration.mjs`, `tests/integration_db.php`, `tests/cloud_migration.php` | Authorization, cancellation, failed-write rollback, workflow routing, storage, and cloud import coverage. |
| `tests/nomination_viewer_browser.mjs`, `tests/nomination_viewer_fixture.tsx`, `tests/nomination_browser.mjs`, `tests/nomination_pdf.test.ts` | Desktop and mobile revision flow, original nomination and signature regression, and attachment/signature version coverage. |
| `NOMINATION_ENHANCEMENT.md`, `tests/README.md` | Local rollout, API behavior, and test instructions. |
