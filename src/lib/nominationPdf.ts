import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import { Application, ApplicationHistory, UserRole } from '../types';
import { praiseService } from './api';

type NominationSignature = Awaited<ReturnType<typeof praiseService.getNominationSignature>>;
const value = (text: unknown) => text === undefined || text === null || text === '' ? 'Not recorded' : String(text);
const date = (text?: string) => !text || Number.isNaN(new Date(text).getTime()) ? 'Not recorded' : text;
const safeFilename = (text: string) => text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Nomination';

/** Build from an authorized form response, never the dashboard's cached summary. */
export async function buildNominationPdf(
  application: Application,
  history: ApplicationHistory[],
  role: UserRole,
  signature?: NominationSignature,
): Promise<Uint8Array> {
  const restricted = role === 'EVALUATOR';
  if (!restricted && application.signature_signed_at && !signature) {
    throw new Error('The recorded signature could not be loaded. Please try again.');
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = 182;
  let y = 49;
  const section = (title: string, rows: unknown[][]) => {
    autoTable(doc, {
      startY: y,
      head: [[{ content: title, colSpan: 2 }]],
      body: rows.map(row => row.map(value)),
      theme: 'grid',
      pageBreak: 'avoid',
      margin: { top: 28, bottom: 20, left: 14, right: 14 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 53, fontStyle: 'bold' }, 1: { cellWidth: 129 } },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  section('01  NOMINATION OVERVIEW', [
    ['Reference number', application.application_number], ['Award', application.award_name],
    ['Award year', application.award_year], ['Nomination classification', application.nomination_origin],
    ['Nomination type', application.nomination_type], ['Nomination date', date(application.date_of_nomination)],
    ['Current status', application.status], ['Processing stage', application.processing_stage],
  ]);
  section('02  NOMINEE INFORMATION', [
    ['Full name', application.nominee_name], ['Employee ID', application.employee_id],
    ['Position', application.position_title], ['Office / Department', application.office_name],
    ['Division / Section', application.division_section], ['Employment category', application.employment_category],
    ['Contact number', application.contact_number], ['Email', application.email], ['Barangay', application.barangay],
  ]);
  section('03  NOMINATOR INFORMATION', restricted ? [['Identity and signature', 'Restricted during scoring.']] : [
    ['Full name', application.nominator_name], ['Position', application.nominator_position],
    ['Office / Department', application.nominating_office],
  ]);
  section('04  NOMINATION DETAILS', [
    ['Justification and merits', application.justification],
    ['Accomplishments and public impact', application.accomplishments], ['Supporting narrative', application.supporting_narrative],
  ]);

  // Keep the signature and its provenance together, including on long forms.
  if (!restricted) {
    if (y > 209) { doc.addPage(); y = 28; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 58, 138);
    doc.text('05  NOMINATOR ELECTRONIC SIGNATURE', 14, y + 5);
    if (signature) {
      doc.setDrawColor(226, 232, 240); doc.rect(14, y + 9, 80, 24);
      doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.3);
      signature.strokes.forEach(stroke => stroke.slice(1).forEach(([x, sy], index) => {
        const [previousX, previousY] = stroke[index];
        doc.line(16 + previousX * 76, y + 10 + previousY * 22, 16 + x * 76, y + 10 + sy * 22);
      }));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
      const provenance = [
        `Signed by: ${value(signature.signed_snapshot.nominator_name)}`,
        `Recorded: ${date(signature.signed_at)} (server time).`,
        'Signature retained from the original submission. Later revisions are not re-signed.',
        `Integrity reference: ${signature.sha256}`,
      ].flatMap(line => doc.splitTextToSize(line, width) as string[]);
      doc.text(provenance, 14, y + 39);
      y += 43 + provenance.length * 3.5;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('No electronic signature recorded.', 14, y + 14); y += 23;
    }
  }
  const submitted = history.filter(log => log.action === 'Nomination Submitted').sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  section('06  SUBMISSION INFORMATION', [
    ['Account used to submit', restricted ? 'Restricted during scoring' : application.submission_account_name || application.nominator_id],
    ['Submission account role', restricted ? 'Restricted during scoring' : application.submission_account_role?.replaceAll('_', ' ')],
    ['Submission date', date(submitted?.created_at)], ['Record created', date(application.created_at)],
    ['Last updated', date(application.updated_at)], ['Remarks', application.remarks], ['Required action', application.required_action],
  ]);

  // Fetch with the session cookie: document URLs point to the authorized download endpoint.
  const attachments: { name: string; mime: string; bytes: Uint8Array }[] = [];
  for (const attachment of application.documents || []) {
    if (!attachment.file_url) continue;
    try {
      const response = await fetch(attachment.file_url, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error('Download failed');
      const mime = (attachment.file_type || response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mime)) {
        throw new Error('Unsupported file response');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error('Empty file');
      const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'docx';
      const name = safeFilename(attachment.document_name);
      attachments.push({ name: `${attachments.length + 1}_${name}${name.toLowerCase().endsWith(`.${extension}`) ? '' : `.${extension}`}`, mime, bytes });
    } catch {
      throw new Error(`Unable to include attachment "${attachment.document_name}". Please check access and try again.`);
    }
  }
  section('07  SUPPORTING DOCUMENTS', application.documents?.length ? application.documents.map(attachment => [
    attachment.document_name,
    `Status: ${attachment.status}\nUploaded: ${date(attachment.uploaded_at)}\n${attachment.file_url ? 'Original file embedded in this PDF.' : 'No file recorded.'}${attachment.verification_remarks ? `\nReview remarks: ${attachment.verification_remarks}` : ''}`,
  ]) : [['Attachments', 'No documents attached.']]);

  const formPages = doc.getNumberOfPages();
  for (let page = 1; page <= formPages; page++) {
    doc.setPage(page);
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('CITY GOVERNMENT OF TACLOBAN - HRMDO PRAISE', 14, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('NOMINATION FORM', 14, 16);
    if (page === 1) {
      doc.setTextColor(30, 58, 138); doc.setFontSize(10);
      doc.text(doc.splitTextToSize(value(application.application_number), width), 14, 32);
      doc.setFontSize(8); doc.setTextColor(71, 85, 105);
      doc.text(doc.splitTextToSize(attachments.length ? 'PDF/image attachments follow as pages. Original files, including Word documents, are embedded. Use the attachments panel in a PDF reader such as Adobe Acrobat to save originals.' : 'Nomination record exported from HRMDO PRAISE.', width), 14, 38);
    }
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Form page ${page} of ${formPages}`, 196, 287, { align: 'right' });
  }
  const pdf = await PDFDocument.load(doc.output('arraybuffer'));
  for (const attachment of attachments) {
    await pdf.attach(attachment.bytes, attachment.name, { mimeType: attachment.mime });
    const attachmentPage = async (note?: string) => {
      const label = new jsPDF();
      label.setFillColor(15, 23, 42); label.rect(0, 0, 210, 22, 'F');
      label.setFontSize(10); label.setTextColor(255); label.text('HRMDO PRAISE - SUPPORTING ATTACHMENT', 14, 13);
      label.setTextColor(30, 41, 59); label.setFontSize(10);
      label.text(label.splitTextToSize(attachment.name, width), 14, 32);
      if (note) { label.setFontSize(9); label.text(label.splitTextToSize(note, width), 14, 60); }
      const source = await PDFDocument.load(label.output('arraybuffer'));
      const [page] = await pdf.copyPages(source, [0]);
      return pdf.addPage(page);
    };
    if (attachment.mime === 'application/pdf') {
      try {
        const source = await PDFDocument.load(attachment.bytes);
        await attachmentPage('The following pages reproduce the submitted PDF. The original file is also embedded in this nomination PDF.');
        (await pdf.copyPages(source, source.getPageIndices())).forEach(page => pdf.addPage(page));
      } catch {
        // Password-protected or malformed PDFs remain available as original embedded files.
        await attachmentPage('Preview unavailable. The original PDF is embedded; open the attachments panel in your PDF reader to save it.');
      }
    } else if (attachment.mime.startsWith('image/')) {
      try {
        const image = attachment.mime === 'image/png' ? await pdf.embedPng(attachment.bytes) : await pdf.embedJpg(attachment.bytes);
        const page = await attachmentPage();
        const scale = Math.min(515 / image.width, 650 / image.height);
        const dimensions = { width: image.width * scale, height: image.height * scale };
        page.drawImage(image, { x: (595.28 - dimensions.width) / 2, y: 40 + (650 - dimensions.height) / 2, ...dimensions });
      } catch {
        throw new Error(`Unable to render attachment "${attachment.name}". Please check the image and try again.`);
      }
    }
  }
  pdf.setTitle(`Nomination Form - ${application.application_number}`);
  pdf.setAuthor('City Government of Tacloban - HRMDO PRAISE');
  return pdf.save();
}

export async function downloadNominationPdf(applicationId: string, role: UserRole): Promise<void> {
  const { application, history } = await praiseService.getNominationForm(applicationId);
  const signature = role !== 'EVALUATOR' && application.signature_signed_at
    ? await praiseService.getNominationSignature(applicationId) : undefined;
  const bytes = await buildNominationPdf(application, history, role, signature);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${safeFilename(application.application_number)}_Nomination_Form.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
