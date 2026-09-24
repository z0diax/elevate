from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tmp/pdfs/deps'))
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from xml.sax.saxutils import escape

OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
NAVY = colors.HexColor('#14283F')
BLUE = colors.HexColor('#1663A5')
TEAL = colors.HexColor('#087E83')
INK = colors.HexColor('#27384A')
styles.add(ParagraphStyle(name='TitleX', fontName='Helvetica-Bold', fontSize=31, leading=36, textColor=NAVY, spaceAfter=19))
styles.add(ParagraphStyle(name='H1X', fontName='Helvetica-Bold', fontSize=23, leading=28, textColor=NAVY, spaceAfter=15))
styles.add(ParagraphStyle(name='H2X', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=BLUE, spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle(name='BodyX', fontName='Helvetica', fontSize=10, leading=14.6, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name='SmallX', fontName='Helvetica', fontSize=8.5, leading=12, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name='CellX', fontName='Helvetica', fontSize=9, leading=12.6, textColor=INK))
styles.add(ParagraphStyle(name='WhiteX', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.white))
styles.add(ParagraphStyle(name='KickerX', fontName='Helvetica-Bold', fontSize=9, leading=13, textColor=TEAL, spaceAfter=9))
story=[]
sections=[]
def p(t, style='BodyX'): return Paragraph(t, styles[style])
def body(t): story.append(p(t))
def h(t): story.append(p(t,'H2X'))
def step(n,t): body(f'<b>{n:02d}.</b> {t}')
def note(t):
    table=Table([[p(t,'SmallX')]], colWidths=[487])
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#EAF3F7')),('BOX',(0,0),(-1,-1),0.5,colors.HexColor('#C6DDE6')),('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.extend([Spacer(1,5),table,Spacer(1,9)])
def table(headers, rows, widths):
    data=[[p(x,'WhiteX') for x in headers]]+[[p(x,'CellX') for x in row] for row in rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F2F6FA'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),1,BLUE)]))
    story.extend([t,Spacer(1,9)])
def page(num,title,subtitle):
    story.append(PageBreak())
    sections.append((title,num))
    story.append(p(f'WALKTHROUGH / {num:02d}','KickerX'))
    story.append(p(title,'H1X'))
    body(subtitle)

class Workflow(Flowable):
    def __init__(self): Flowable.__init__(self); self.width=487; self.height=205
    def draw(self):
        c=self.canv
        labels=[('1  Submit','Nominee / authorized filing user'),('2  Endorse','Head of Office'),('3  Verify documents','Secretariat / Administrator'),('4  Score','Assigned evaluators'),('5  Deliberate','Committee decision entered by staff'),('6  Record final decision','Administrator / Secretariat'),('7  Confer award','Administrator / Secretariat')]
        for i,(a,b) in enumerate(labels):
            y=177-i*29
            c.setFillColor(colors.HexColor('#EAF3F7'));c.roundRect(0,y,487,25,5,stroke=0,fill=1)
            c.setFillColor(NAVY);c.setFont('Helvetica-Bold',10);c.drawString(12,y+9,a)
            c.setFont('Helvetica',9);c.drawString(175,y+9,b)
            if i<6:
                c.setStrokeColor(TEAL);c.line(243,y,243,y-4)

story.append(Spacer(1,58))
story.append(p('CITY GOVERNMENT OF TACLOBAN','KickerX'))
story.append(p('PRAISE<br/>Application Walkthrough','TitleX'))
body('A practical onboarding guide to nomination entry, document compliance, endorsement, evaluation, deliberation, and award outputs.')
note('<b>Who this is for:</b> Nominees, Heads of Office, Secretariat staff, Evaluators, and Administrators. Start with your role, then follow the same nomination through each handoff.')
h('What you will learn')
body('How to complete all four nomination steps; who enters and reviews each part of a record; how to replace rejected files; how scores become a committee decision; and where to download summaries and certificates.')
h('About this edition')
body('Prepared 23 September 2026 from the application source in this project. Menu and button names reflect the current code. Award requirements and account assignments depend on your deployment.')
body('This is a source-based user guide. Live accounts and a complete live nomination cycle were not exercised. Current implementation limitations are called out wherever they affect the instructions.')
story.append(Spacer(1,24))
body('<b>Keep the application reference number.</b><br/>Use it whenever you ask the Secretariat about a nomination.')

page(2,'Find your starting point','Read pages 3-5 first for the roles, login process, and overall workflow.')
table(['Topic','Page'],[
('Who does what','3'),('Sign in and prepare','4'),('The nomination lifecycle','5'),('Form step 1: nominee and award','6'),('Form step 2: nomination merits','7'),('Form steps 3-4: attach and submit','8'),('Nominee: tracking and corrections','9'),('Head of Office: endorsement','10'),('Secretariat: verification and routing','11'),('Evaluator: scoring a nomination','12'),('Deliberation, award, and reports','13'),('Administrator: prepare the system','14'),('Troubleshooting and practice checklist','15'),('System map and source references','16')],[425,62])
h('A quick route for each reader')
body('<b>Filing a nomination:</b> pages 6-9. <b>Reviewing an office submission:</b> page 10. <b>Checking attachments and assigning reviewers:</b> page 11. <b>Scoring:</b> page 12. <b>Recording the result:</b> page 13. <b>Setting up accounts and awards:</b> page 14.')
note('Throughout this guide, <b>nominee</b> means the person or team being considered. <b>Nominator</b> means the person putting the candidate forward. The signed-in user is recorded as the submitting account, even when another name is typed into the Nominator Name field.')

page(3,'Who does what','All filing roles use the same four-step nomination wizard. Their work after submission differs.')
table(['Role / starting menu','Nomination entry','Next responsibility'],[
('Nominee<br/><b>My Nominations</b>','Can file through Submit Nomination. The record is linked to the signed-in nominee account.','Track matching records, inspect attachments, replace rejected files, download summary and awarded certificate.'),
('Head of Office<br/><b>Office Endorsements</b>','Can file nominations, including entries prepared for personnel in the office.','Review office records; endorse, return for revision, or reject with reasons.'),
('Secretariat<br/><b>Secretariat Desk</b>','Can encode nominations on behalf of candidates.','Verify files, request compliance, assign evaluators, enter committee decisions, and produce reports.'),
('Evaluator<br/><b>Evaluator Matrix</b>','No Submit Nomination menu. Enters criterion scores and assessment remarks.','Review assigned nomination evidence and submit an evaluation.'),
('Administrator<br/><b>Admin Dashboard</b>','Can file nominations and monitor all applications.','Maintain awards, offices, and users; access verification, deliberation, reports, and audit logs.')],[130,166,191])
h('When someone enters the form for another person')
body('Enter the candidate\'s name, contact details, email, and office in Nominee Information. Nominator Name initially uses the signed-in user\'s name and can be changed. The nominator account ID still belongs to the signed-in user.')
body('For staff-filed records, the wizard does not provide a nominee-account selector. My Nominations matches records using IDs, email, or names. Use the candidate\'s correct registered email and full name; ask the Secretariat to check a missing or unexpected record.')
note('These are the app\'s normal menu-based responsibilities, not a security audit of API permissions. There is no separate committee-member login role; Administrator and Secretariat accounts operate the deliberation screen.')

page(4,'Sign in and prepare','Use the deployment address supplied by your Administrator. On the XAMPP host, the documented address is http://localhost/tacloban-praise/.')
step(1,'Open the application and sign in with your registered email address and password. The app opens the dashboard for your assigned role.')
step(2,'If you need a nominee account, use the login screen\'s sign-up option. Enter full name, email, password, and matching confirmation. Passwords must be at least 8 characters. Public registration creates a <b>Nominee</b> account only.')
step(3,'For Head of Office, Secretariat, Evaluator, or Administrator access, obtain an account and the correct role from the Administrator. Ask them to verify your office assignment.')
step(4,'Open <b>Awards Guidelines</b> if it appears in your menu. Check the award description, eligibility, documentary requirements, criteria, and minimum score. Staff can review award configuration and the selected award\'s requirements in their available screens.')
step(5,'Gather all nomination details and supporting files before starting. Keep copies of your narratives and original attachments outside the form.')
table(['Prepare','What to have ready'],[
('Nominee profile','Full name, position, office, employment category, mobile number, email; employee ID, division, and barangay where applicable.'),
('Merit statements','Executive justification, concrete accomplishments and impact, supporting narrative.'),
('Evidence','A file for every mandatory requirement of the chosen award; readable scans or documents.'),
('Account details','Correct user role, office, full name, and candidate contact information.')],[119,368])
note('<b>No Save Draft control is implemented in the nomination wizard.</b> Its entries are held in the current screen until submission. Leaving, cancelling, refreshing, or signing out can lose unfinished work. On a shared computer, sign out after completing your work.')

page(5,'The nomination lifecycle','The tracker displays seven processing stages. A status describes the condition of a record within that process.')
story.append(Workflow())
h('Normal handoffs')
body('A submitted nomination is intended to receive office endorsement, then document verification. Verified records are routed to evaluators. Once the required evaluation count is reached, the nomination moves to deliberation. Approval is followed by a separate award-conferment action.')
table(['Status to recognize','Meaning / next owner'],[
('For Endorsement','Head of Office review is expected.'),
('For Verification / Incomplete','Secretariat checks evidence; nominee may need to replace rejected files.'),
('Verified / For Evaluation','Ready for assignment, or assigned for scoring.'),
('Under Evaluation / Evaluation Completed','Some assessments are pending, or scoring is ready for deliberation.'),
('Approved / Not Approved / Awarded','Committee result recorded; Awarded follows separate conferment.')],[192,295])
note('<b>Current routing behavior:</b> creating the record sets <b>For Endorsement</b>, but uploading any attachment sets <b>For Verification</b>. Since the wizard uploads files immediately after creation, a normal filing with attachments can already show Document Verification without an endorsement. Staff should check the Audit Trail and coordinate Head of Office review; the status alone does not prove endorsement occurred.')

page(6,'Form step 1: nominee and award','Open Submit Nomination. Select the intended award before preparing its attachments.')
step(1,'Choose the award card. Read the displayed eligibility requirements. Confirm with the Secretariat that this is the correct award and cycle; the wizard has no separate award-year input.')
step(2,'Complete <b>Nominee Information</b>. Check the default office and barangay carefully; the barangay initially displays Brgy. 88 San Jose.')
table(['Field','How to complete it'],[
('Full Name of Nominee *','Use the candidate\'s full name consistently with the account and evidence.'),
('Employee / Personnel ID','Enter the personnel identifier where applicable; the field is not mandatory.'),
('Position / Designation *','Enter the actual position or designation of the nominee.'),
('Department / Office *','Choose the office responsible for this nomination. It influences office review.'),
('Division / Section','Add the relevant unit where applicable.'),
('Employment Category *','Choose Permanent, Casual, Contractual, Job Order, Barangay Official, or Barangay Worker.'),
('Contact Mobile Number *','Enter the nominee\'s contact number.'),
('Email Address *','Use an accurate address, preferably the nominee\'s registered email for matching.'),
('Barangay Jurisdiction','Select the applicable Tacloban barangay; do not accept the initial value without checking.')],[181,306])
step(3,'Click <b>Continue</b>. The wizard checks for an award, nominee name, position, contact number, and email. Correct the error message if it will not advance.')
note('The account profile does not automatically fill all nominee fields. A Nominee account links the filing to itself even if a different candidate name is typed. For ordinary self-submission, enter your own details; coordinate staff-assisted nominations with the Secretariat.')

page(7,'Form step 2: nomination merits','Explain why the nominee meets the selected award\'s criteria and connect each claim to evidence.')
table(['Field','What to enter'],[
('Nomination Type','Individual Category or Group / Team Category.'),
('Nominator Name','The person putting the nomination forward. Defaults to the signed-in user\'s name.'),
('Executive Justification *','Why this candidate deserves the award. At least 20 characters are required.'),
('Key Accomplishments & Concrete Impact *','Specific work, results, and benefits to Tacloban City operations. At least 20 characters are required.'),
('Supporting Narrative / Special Acts *','Context, supporting facts, or relevant acts of service, integrity, or heroism. This must not be blank.')],[185,302])
h('Illustrative writing example')
body('<b>Justification:</b> "The nominee improved the office\'s records service by organizing requests and introducing a documented daily monitoring process."')
body('<b>Accomplishments:</b> "During the stated reporting period, the team reduced its pending requests from 120 to 30. The attached monitoring report explains the baseline, dates, and counting method."')
body('<b>Supporting narrative:</b> "The nominee coordinated staff orientation, checked the daily register, and reviewed unresolved requests with the unit head. Supporting records identify the nominee\'s contribution."')
body('These are fictional examples, not award requirements or facts about any candidate. Replace them with accurate dates, measurable results, and evidence for your actual nomination.')
h('Group / Team entries')
body('The form offers a Group / Team option but no separate member roster. Confirm with the Secretariat how the nominee name and contact person should be recorded, and document membership in the narrative or requested evidence.')
step(1,'Review the narrative against the award criteria. Avoid unsupported claims and make each uploaded document easy to relate to the text.')
step(2,'Click <b>Continue</b>. Use <b>Back</b> if profile details need correction.')

page(8,'Form steps 3-4: attach and submit','Attachments follow the selected award\'s configured checklist. A selected file is uploaded to the server during official submission.')
h('Step 3 - Upload Required Documentary Attachments')
step(1,'For each requirement, click <b>Upload File</b>. Items labelled <b>Mandatory</b> must have a file before you can continue.')
step(2,'Choose PDF, DOCX, DOC, JPG, JPEG, or PNG. The initial wizard checks a maximum of <b>10 MB per file</b>; server upload limits may be lower.')
step(3,'Check the attached filename and displayed size. Use <b>Replace File</b> if you chose the wrong file. Each checklist item holds one selected file.')
step(4,'Click <b>Continue</b> only after all mandatory items are attached. If you change the award, its attachment checklist resets; recheck and reselect your files.')
h('Step 4 - Review and officially submit')
step(5,'Review the nominee, award, office/barangay, position/category, justification, and attachment count. Use Back to review fields not repeated in the summary.')
step(6,'Read the displayed affirmation of truthfulness, then click <b>Officially Submit Nomination</b>. Wait while the record and attachments are saved.')
step(7,'Look for <b>Nomination Successfully Filed!</b> Save the <b>Official Reference No.</b>, for example PRAISE-2026-00001. The app generates it; you do not type it.')
step(8,'Use <b>Download Summary Form A-1 (PDF)</b> and <b>Go to Application Tracking</b>. Nominees return to My Nominations; other filing roles return to their role\'s default screen.')
note('<b>If an upload fails:</b> the application may already exist because creation and file uploads happen separately. Do not immediately repeat official submission. Check tracking or ask the Secretariat to locate the saved record and missing attachments, using the candidate name and submission time if you did not receive a reference number.')
body('A summary PDF is a useful record of the entry. Confirm the saved files and current status in the app; downloading the summary does not verify documents or approve the nomination.')

page(9,'Nominee: tracking and corrections','My Nominations is your main workspace after filing.')
step(1,'Select the nomination from the list. Confirm its reference number and award before taking action.')
step(2,'Read the <b>status badge</b>, <b>processing stage</b>, and <b>Current Next Step & Directive</b>. The directive explains what the next person needs to do.')
step(3,'Open the Audit Trail to see recorded workflow actions. Review document statuses and use the document viewer to inspect files. Download the application summary when needed.')
h('Replacing a rejected attachment')
step(4,'Find <b>Action Required: Non-compliant documents returned by the Secretariat</b>. Read the reason for each rejected file.')
step(5,'Prepare the corrected file, then click <b>Re-upload Compliant File</b> on that specific document. Wait for successful upload and recheck the status.')
step(6,'The replacement document becomes <b>For Verification</b> and the application moves to Document Verification. The Secretariat must inspect it again. Re-uploading is not the same as being verified.')
h('Returned form versus rejected document')
table(['Situation','What you can do now'],[
('Rejected document appears','Use its Re-upload Compliant File control and correct the stated deficiency.'),
('Returned for Revision, but no rejected file','Read the directive and contact the Head of Office or Secretariat. There is no general narrative/profile edit-and-resubmit screen.'),
('Required file was never attached','The nominee screen has no general add-missing-document control. Coordinate recovery with the Secretariat.'),
('Awarded','Download the certificate from the selected nomination.')],[178,309])
note('The replacement control is shown for documents marked <b>Rejected</b>. A Returned for Revision application status alone does not make the nomination form editable. Keep the existing reference number when discussing corrections.')

page(10,'Head of Office: endorsement','Use Office Endorsements to review nominations belonging to your office. You can also open Submit Nomination to file an entry.')
step(1,'Confirm your office assignment. Select the candidate record and check the reference number, award, nominee profile, merits, and listed evidence.')
step(2,'Use the application summary and Audit Trail to review the entry and previous actions. Check whether the record has already moved beyond endorsement.')
step(3,'Enter endorsement remarks or specific correction instructions. Choose the appropriate decision below.')
table(['Decision','Required input / result'],[
('Endorse','Record supporting remarks. If blank, the app supplies an endorsement statement. The application moves to For Verification / Document Verification.'),
('Return for Revision','Remarks are required. The application becomes Returned for Revision at the Endorsement stage.'),
('Reject / non-endorsement','A reason is required. The application becomes Not Approved at Final Decision; this is not a request for a replacement file.')],[151,336])
h('Example of a useful return note')
body('"Please provide the reporting dates and explain which activities were completed by the nominee. Coordinate the narrative correction with the Secretariat under this reference number."')
h('After your decision')
body('Confirm the updated status and history. An endorsement sends the record to Secretariat verification; it does not assign scores or confer an award. For a returned narrative, coordinate the correction because the current nominee screen only supports replacement of rejected attachments.')
note('<b>Check all office records, not only the pending count.</b> Initial uploads can already move a nomination to For Verification. The office list includes more than just pending endorsements. Coordinate any missing endorsement before downstream processing. Also ask the Administrator to set your office: without an office ID, the current office filter may show a broader list.')

page(11,'Secretariat: verify and route','Use Secretariat Desk or Document Verification. This workbench contains records in verification and evaluation-related statuses.')
step(1,'Select the nomination. Check the award checklist, actual attachments, and Audit Trail. Confirm that any required office endorsement has been handled.')
step(2,'Open a document using its view control. PDFs and images can preview; use <b>Open File</b> or <b>Download</b> for other supported files.')
step(3,'For acceptable evidence, choose <b>Verify as Compliant</b>. For a deficient file, write a specific reason and choose <b>Reject / Require Compliance</b>.')
step(4,'Repeat for every attachment. A rejected or missing-status document can make the application <b>Incomplete</b>. The nominee can replace a rejected document for another verification pass.')
step(5,'When all stored attachments are verified, the app sets <b>Verified</b>. The workbench also has a mark-verified action when its conditions are met.')
step(6,'Select at least one evaluator in the routing area, add routing remarks if useful, and use the routing button. The record becomes <b>For Evaluation</b>.')
h('The checks you still need to perform')
body('Compare the award\'s mandatory checklist with the files actually stored. The workbench\'s "all verified" condition checks existing attachments, so it is not independent proof that every required attachment exists.')
body('Use specific rejection remarks, such as "The scan is missing the signature page; please upload the complete signed document." This creates an actionable replacement task in My Nominations.')
h('Returning the whole application')
body('The return-for-revision control requires remarks and sets Returned for Revision. That status is outside the Secretariat workbench\'s normal list. Use All Applications to locate it, and coordinate the recovery path. Returning a record alone does not open an editable nomination wizard for its owner.')
note('The routing control requires verified documents (or Verified application status) and at least one evaluator. If no evaluators are available, ask the Administrator to create or correctly assign evaluator accounts. An award with no stored attachments also needs staff review because the normal all-documents-verified check requires at least one document.')

page(12,'Evaluator: score a nomination','Use Evaluator Matrix. Review the candidate\'s evidence against the criteria configured for that award.')
step(1,'Select the nomination assigned to you and confirm the award. Review the accomplishments, justification, and supporting documents.')
step(2,'Enter a raw score for each criterion within its displayed maximum. <b>New scoring forms initially contain maximum scores</b>; deliberately review every value before submitting.')
step(3,'Add criterion remarks where useful and enter the required summary assessment. Check the computed total and qualifying-standard indicator.')
step(4,'Click <b>Officially Submit Evaluation</b>. The app locks your submitted assessment in the screen and records its submission date.')
h('How the weighted score works')
body('<b>Criterion contribution = (raw score / maximum score) x criterion weight.</b><br/>The evaluator total is the sum of these contributions.')
table(['Illustrative criterion','Raw / maximum','Weight','Contribution'],[
('Criterion A','90 / 100','50%','45 points'),('Criterion B','80 / 100','30%','24 points'),('Criterion C','95 / 100','20%','19 points'),('<b>Total</b>','','100%','<b>88%</b>')],[159,116,85,127])
body('These example weights are not a specific award\'s configuration. If two evaluators submit 88% and 92%, the consolidated average is <b>90%</b>. The app averages submitted evaluator totals, rather than adding them.')
h('What happens next')
body('While assessments remain, the status is Under Evaluation. When the submitted evaluation count reaches the assigned evaluator count, the status becomes Evaluation Completed and the stage becomes Deliberation. Meeting a qualifying score does not automatically approve the nomination.')
note('The queue can show evaluation-stage records beyond your assignments; the API rejects submissions for another evaluator\'s assigned record. Confirm assignments with the Secretariat. No user-facing reopen control was found for submitted assessments; contact the Administrator if a correction is needed.')

page(13,'Deliberation, awards, and reports','Administrator and Secretariat users operate PRAISE Deliberation to record the committee\'s outcome.')
step(1,'Filter by award and select a nomination. Review the consolidated score, individual evaluator assessments, and Audit Trail. Rankings are sorted by score; verify the correct award cohort before using a rank.')
step(2,'Enter the committee resolution remarks. Use <b>Approve for Award</b> or <b>Disapprove</b>. Non-approval requires a reason; approval uses a default statement if remarks are blank.')
step(3,'Confirm the result. Approved and Not Approved are Final Decision outcomes. A recorded committee decision cannot be replaced through the normal decision action.')
step(4,'For an Approved nomination, use <b>Confer Award</b> when the award should be recorded. This separate action sets Awarded and the award date. Download the selected nominee\'s certificate.')
note('Confer Award records the outcome in the app; it is not a payment or incentive-disbursement transaction. Follow the organization\'s actual award and release process before recording conferment.')
h('Available outputs')
table(['Output / menu','Use'],[
('Summary Form A-1','Nomination details, narratives, and attachment checklist. Download for the selected nomination where available.'),
('Official Ranking Matrix','Available on the deliberation board for its current list.'),
('Reports & Certificates','Export CSV Dataset, Generate Ranking Matrix (PDF), department participation/output, and certificate tools.'),
('Print Latest Certificate (PDF)','Uses the latest awarded record. For a specific recipient, use that nominee\'s certificate action instead.'),
('Certificate Template','Configure citation/conferment wording, signatories, and supported layout settings; review the preview.'),
('Audit Logs / Audit Trail','Review recorded actions, actors, status changes, remarks, and timing.')],[187,300])
body('Reports also offers Download Sample Form A-1 from an existing application. Confirm the candidate and reference on every generated output; a sample or latest-record shortcut is not a selection of any nominee you choose.')

page(14,'Administrator: prepare the system','Before onboarding staff, make sure offices, award rules, and user assignments reflect the intended nomination cycle.')
step(1,'Open <b>Offices & Depts</b>. Create or review office name, code, department head name, and official title. These records provide the office choices used in nominations and account assignments.')
step(2,'Open <b>Manage Awards</b>. Review award title, code, year, minimum qualifying score, description, criteria and percentage weights, and documentary attachment requirements.')
step(3,'Confirm the criteria and their total allocation, and mark mandatory document requirements correctly. Review the saved configuration before allowing nominations against it.')
step(4,'Open <b>User Access</b>, then <b>Create User</b>. Enter full name, email, role, assigned department, position title, and initial password. Set the correct role for each staff member.')
step(5,'Use the account management controls to correct roles/department assignments or reset a password when needed. Check a Head of Office account\'s department before office review begins.')
step(6,'Monitor <b>All Applications</b> and the Admin Dashboard. Use Document Verification, PRAISE Deliberation, Reports & Certificates, and Audit Logs for their respective workflows.')
h('A practical readiness checklist')
body('Confirm the right award and year; mandatory attachments; scoring criteria; a Head of Office for the intended office; at least one evaluator; a Secretariat account; and certificate wording/signatories. Have each user confirm that their landing screen matches their role.')
h('Deletion is not a revision workflow')
body('Administrator deletion can remove nomination records and related data/files. Do not use it as a routine way to fix a narrative or restart a returned nomination. Coordinate record corrections with the responsible office and retain the reference and audit context.')
note('<b>Current award-year behavior:</b> the wizard does not submit a separate award year. The creation endpoint defaults the application year to the server\'s current year. If working with a past or future award cycle, verify how it is recorded before accepting live entries.')

page(15,'Troubleshooting and practice','Use the existing reference number and the exact message when asking for help.')
table(['Problem','Next action'],[
('No Submit Nomination menu','Check your role. Evaluators do not have that menu; ask the Administrator if your role is incorrect.'),
('Continue will not advance','Read the error: required profile data, 20-character justification/accomplishments, supporting narrative, or mandatory files may be missing.'),
('Upload rejected or failed','Check file type, size, readability, connection, and server limits. After a submission error, check for a saved record before trying again.'),
('Record missing from My Nominations','Confirm the nominee email/name and account linkage with the Secretariat. Staff-filed records have no nominee-account picker.'),
('For Verification immediately after filing','Initial file upload changes the stage. Ask staff to confirm the endorsement history.'),
('Returned, but no edit button','Only rejected-file replacement is implemented for nominees. Coordinate narrative/profile changes with staff.'),
('Evaluation submission denied','Check that the Secretariat assigned the record to your evaluator account.'),
('No certificate available','Check for Awarded status. Approved still needs a separate Confer Award action.'),
('No notification arrives','Open the nomination and check its directive and audit history. The notification viewer exists, but these workflow endpoints do not create a notification for every action.')],[174,313])
h('A supervised practice run')
body('In a designated training environment, use fictional details to: file one nomination; record its reference; confirm endorsement; reject and replace one attachment; verify all evidence; assign evaluators; submit assessments; record approval; confer the award; and check the summary, ranking, certificate, and history. Check each handoff with the responsible role.')
note('Completion means the next user can find the same record, understand the directive, and perform the intended next action. This practice checklist is suggested onboarding activity; it was not executed against live records while preparing this guide.')

page(16,'System map and references','For maintainers and trainers: where the documented behavior comes from.')
h('How the app works behind the screens')
body('<b>Browser:</b> React screens collect entries and show role-based menus. <b>Service layer:</b> sends authenticated requests to the PHP API. <b>PHP + MySQL/MariaDB:</b> store accounts, awards, nominations, document metadata, evaluations, and history. Uploaded files are stored under uploads/. The PHP session represents the signed-in user.')
body('For XAMPP, index.php serves the built frontend from dist/. Apache handles the application URL and API routes. Although the service file is named supabase.ts, this deployment explicitly disables Supabase and uses the PHP API.')
h('Where to look in this project')
table(['Source','What it establishes'],[
('src/components/nomination/<br/>NominationWizard.tsx','Four steps, validation, selected files, account linkage, submission order, success outputs.'),
('src/components/dashboards/','Nominee, HeadOfOffice, Secretariat, Evaluator, Deliberation, and Admin dashboards define the role workflows.'),
('src/components/auth/ and<br/>src/components/common/Sidebar.tsx','Login, nominee signup, and role-specific navigation.'),
('api/applications.php<br/>api/documents.php<br/>api/evaluations.php','Creation, status transitions, endorsement, verification, upload/replacement behavior, scoring and decisions.'),
('src/components/reports/<br/>src/lib/pdfGenerator.ts','Reports, certificate template editing, and generated PDF outputs.'),
('src/lib/supabase.ts<br/>src/lib/mysqlService.ts<br/>src/App.tsx','API access, cached records, app state, and dashboard routing.'),
('README_XAMPP.md<br/>api/config/database.php<br/>database.sql','Deployment notes, database connection configuration, and base schema/setup.')],[219,268])
note('<b>Scope:</b> This guide documents the checked-in implementation reviewed on 23 September 2026. It does not certify organizational award policy, backend authorization, or a successful live deployment. Use the configured award rules and responsible office\'s instructions for the actual nomination cycle.')

class NumberedCanvas(canvas.Canvas):
    def __init__(self,*a,**kw): super().__init__(*a,**kw); self.saved=[]
    def showPage(self): self.saved.append(dict(self.__dict__)); self._startPage()
    def save(self):
        total=len(self.saved)
        for state in self.saved:
            self.__dict__.update(state)
            w,h=A4
            self.setStrokeColor(colors.HexColor('#D7E2EC')); self.line(54,49,w-54,49)
            self.setFont('Helvetica',8);self.setFillColor(INK)
            self.drawString(54,34,'TACLOBAN PRAISE  |  User walkthrough  |  23 September 2026')
            self.drawRightString(w-54,34,f'{self._pageNumber} / {total}')
            if self._pageNumber>1:
                self.setFont('Helvetica-Bold',8); self.setFillColor(BLUE)
                self.drawString(54,h-32,'PRAISE / NOMINATION & ROLE GUIDE')
            super().showPage()
        super().save()

pdf=OUT/'Tacloban_PRAISE_Full_Walkthrough_Guide.pdf'
doc=SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=54,leftMargin=54,topMargin=57,bottomMargin=66,title='Tacloban PRAISE - Full Walkthrough Guide',author='Tacloban PRAISE Project',subject='Nomination entry and user role onboarding')
doc.build(story,canvasmaker=NumberedCanvas)
from pypdf import PdfReader
reader=PdfReader(str(pdf))
assert len(reader.pages)==16, f'Expected 16 pages, got {len(reader.pages)}'
for title,num in sections:
    assert title in reader.pages[num-1].extract_text(), (num,title)
assert all(len(pg.extract_text())>300 for pg in reader.pages)
print(f'Created {pdf}; {len(reader.pages)} pages; contents/page headings verified.')
