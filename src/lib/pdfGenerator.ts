import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Application, Award, CertificateTemplateSettings, Office } from '../types';
import {
  DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS,
  normalizeCertificateTemplateSettings,
  renderCertificateTemplateText,
} from './certificateTemplate';

let activeCertificateTemplateSettings = DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS;
const certificateBackgroundImageCache = new Map<string, string>();
const MM_PER_POINT = 0.352778;

type PdfFontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

type FitTextBlockOptions = {
  fontName: 'helvetica' | 'times' | 'courier';
  fontStyle: PdfFontStyle;
  maxWidth: number;
  maxHeight: number;
  maxFontSize: number;
  minFontSize: number;
  lineHeightFactor?: number;
  maxLines?: number;
};

function normalizeTextLines(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function fitTextBlock(doc: jsPDF, text: string, options: FitTextBlockOptions) {
  const lineHeightFactor = options.lineHeightFactor || 1.25;

  doc.setFont(options.fontName, options.fontStyle);

  for (let fontSize = options.maxFontSize; fontSize >= options.minFontSize; fontSize -= 0.5) {
    doc.setFontSize(fontSize);
    const lines = normalizeTextLines(doc.splitTextToSize(text, options.maxWidth));
    const lineHeight = fontSize * MM_PER_POINT * lineHeightFactor;
    const totalHeight = lineHeight * Math.max(lines.length, 1);

    if ((!options.maxLines || lines.length <= options.maxLines) && totalHeight <= options.maxHeight) {
      return { fontSize, lines, lineHeight, totalHeight };
    }
  }

  doc.setFontSize(options.minFontSize);
  const lines = normalizeTextLines(doc.splitTextToSize(text, options.maxWidth));
  const lineHeight = options.minFontSize * MM_PER_POINT * lineHeightFactor;
  const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;

  return {
    fontSize: options.minFontSize,
    lines: visibleLines,
    lineHeight,
    totalHeight: lineHeight * Math.max(visibleLines.length, 1),
  };
}

function fitSingleLineFontSize(
  doc: jsPDF,
  text: string,
  fontName: 'helvetica' | 'times' | 'courier',
  fontStyle: PdfFontStyle,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number
): number {
  doc.setFont(fontName, fontStyle);

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.5) {
    doc.setFontSize(fontSize);
    if (doc.getTextWidth(text) <= maxWidth) {
      return fontSize;
    }
  }

  return minFontSize;
}

function drawCenteredLines(
  doc: jsPDF,
  lines: string[],
  centerX: number,
  startY: number,
  lineHeight: number
): number {
  lines.forEach((line, index) => {
    doc.text(line, centerX, startY + index * lineHeight, { align: 'center' });
  });

  return startY + (Math.max(lines.length, 1) - 1) * lineHeight;
}

function drawCenteredBlock(
  doc: jsPDF,
  text: string,
  centerX: number,
  topY: number,
  options: FitTextBlockOptions & { color: [number, number, number] }
): number {
  const fitted = fitTextBlock(doc, text, options);
  doc.setFont(options.fontName, options.fontStyle);
  doc.setFontSize(fitted.fontSize);
  doc.setTextColor(...options.color);
  drawCenteredLines(doc, fitted.lines, centerX, topY, fitted.lineHeight);
  return topY + fitted.totalHeight;
}

function drawColumnBlock(
  doc: jsPDF,
  text: string,
  centerX: number,
  topY: number,
  maxWidth: number,
  options: Omit<FitTextBlockOptions, 'maxWidth' | 'maxHeight'> & {
    maxHeight: number;
    color: [number, number, number];
  }
): number {
  const fitted = fitTextBlock(doc, text, {
    ...options,
    maxWidth,
  });

  doc.setFont(options.fontName, options.fontStyle);
  doc.setFontSize(fitted.fontSize);
  doc.setTextColor(...options.color);
  drawCenteredLines(doc, fitted.lines, centerX, topY, fitted.lineHeight);
  return topY + fitted.totalHeight;
}

async function loadImageAsPngDataUrl(source: string): Promise<string> {
  const cachedImage = certificateBackgroundImageCache.get(source);
  if (cachedImage) {
    return cachedImage;
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) {
        reject(new Error('The selected certificate background image is invalid.'));
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Unable to render the certificate background image.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      reject(new Error('Unable to load the certificate background image.'));
    };

    if (!source.startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }

    image.src = source;
  });

  certificateBackgroundImageCache.set(source, dataUrl);
  return dataUrl;
}

async function buildAwardCertificateDoc(
  app: Application,
  templateOverride?: Partial<CertificateTemplateSettings>
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const resolvedTemplateSettings = normalizeCertificateTemplateSettings({
    ...activeCertificateTemplateSettings,
    ...templateOverride,
  });
  const pageCenterX = 148.5;
  const referenceScore = app.final_weighted_score !== undefined && app.final_weighted_score !== null
    ? `${app.final_weighted_score}%`
    : 'N/A';
  const citation = renderCertificateTemplateText(resolvedTemplateSettings.citation_text, app);
  const confermentText = renderCertificateTemplateText(resolvedTemplateSettings.conferment_text, app);

  let hasCustomBackground = Boolean(resolvedTemplateSettings.background_image_url);

  if (hasCustomBackground && resolvedTemplateSettings.background_image_url) {
    try {
      const backgroundDataUrl = await loadImageAsPngDataUrl(resolvedTemplateSettings.background_image_url);
      doc.addImage(backgroundDataUrl, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
    } catch (error) {
      console.warn('Unable to render certificate background image. Falling back to default certificate border.', error);
      hasCustomBackground = false;
    }
  }

  if (!hasCustomBackground) {
    // Certificate Ornate Border
    doc.setDrawColor(202, 138, 4); // Gold / Amber 600
    doc.setLineWidth(2.5);
    doc.rect(8, 8, 281, 194);

    doc.setDrawColor(30, 58, 138); // Royal Navy
    doc.setLineWidth(0.8);
    doc.rect(12, 12, 273, 186);

    // Decorative corner accents
    doc.setFillColor(30, 58, 138);
    doc.rect(12, 12, 15, 4, 'F');
    doc.rect(12, 12, 4, 15, 'F');
    doc.rect(270, 12, 15, 4, 'F');
    doc.rect(281, 12, 4, 15, 'F');
    doc.rect(12, 194, 15, 4, 'F');
    doc.rect(12, 183, 4, 15, 'F');
    doc.rect(270, 194, 15, 4, 'F');
    doc.rect(281, 183, 4, 15, 'F');
  }

  // Header titles
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('REPUBLIC OF THE PHILIPPINES', pageCenterX, 28, { align: 'center' });
  doc.setFontSize(17);
  doc.text('CITY GOVERNMENT OF TACLOBAN', pageCenterX, 41, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  drawCenteredBlock(
    doc,
    'PROGRAM ON AWARDS AND INCENTIVES FOR SERVICE EXCELLENCE',
    pageCenterX,
    49,
    {
      fontName: 'helvetica',
      fontStyle: 'normal',
      maxWidth: 182,
      maxHeight: 8,
      maxFontSize: 10,
      minFontSize: 8,
      lineHeightFactor: 1.2,
      maxLines: 2,
      color: [59, 86, 154],
    }
  );

  // Certificate title
  doc.setTextColor(180, 83, 9); // Amber 700
  doc.setFont('times', 'bold');
  drawCenteredBlock(
    doc,
    'CERTIFICATE OF RECOGNITION',
    pageCenterX,
    70,
    {
      fontName: 'times',
      fontStyle: 'bold',
      maxWidth: 200,
      maxHeight: 20,
      maxFontSize: 30,
      minFontSize: 24,
      lineHeightFactor: 1.05,
      maxLines: 2,
      color: [180, 83, 9],
    }
  );

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(12);
  doc.text('is proudly conferred upon', pageCenterX, 94, { align: 'center' });

  // Nominee name
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fitSingleLineFontSize(doc, app.nominee_name.toUpperCase(), 'helvetica', 'bold', 185, 24, 17));
  doc.text(app.nominee_name.toUpperCase(), pageCenterX, 108, { align: 'center' });

  // Line under name
  doc.setDrawColor(202, 138, 4);
  doc.setLineWidth(0.8);
  doc.line(74, 112, 223, 112);

  // Position and office
  drawCenteredBlock(doc, app.position_title, pageCenterX, 118, {
    fontName: 'helvetica',
    fontStyle: 'normal',
    maxWidth: 190,
    maxHeight: 7,
    maxFontSize: 12,
    minFontSize: 9,
    lineHeightFactor: 1.2,
    maxLines: 1,
    color: [71, 85, 105],
  });

  drawCenteredBlock(doc, app.office_name, pageCenterX, 124.5, {
    fontName: 'helvetica',
    fontStyle: 'bold',
    maxWidth: 200,
    maxHeight: 10,
    maxFontSize: 12,
    minFontSize: 9,
    lineHeightFactor: 1.15,
    maxLines: 2,
    color: [30, 58, 138],
  });

  // Citation and award details
  drawCenteredBlock(doc, citation, pageCenterX, 137, {
    fontName: 'helvetica',
    fontStyle: 'normal',
    maxWidth: 212,
    maxHeight: 18,
    maxFontSize: 10.5,
    minFontSize: 8.5,
    lineHeightFactor: 1.25,
    maxLines: 4,
    color: [51, 65, 85],
  });

  drawCenteredBlock(doc, (app.award_name || 'Tacloban PRAISE Award').toUpperCase(), pageCenterX, 161, {
    fontName: 'times',
    fontStyle: 'bold',
    maxWidth: 210,
    maxHeight: 15,
    maxFontSize: 16,
    minFontSize: 12,
    lineHeightFactor: 1.05,
    maxLines: 2,
    color: [180, 83, 9],
  });

  drawCenteredBlock(doc, confermentText, pageCenterX, 177, {
    fontName: 'helvetica',
    fontStyle: 'normal',
    maxWidth: 220,
    maxHeight: 10,
    maxFontSize: 9.5,
    minFontSize: 7.5,
    lineHeightFactor: 1.15,
    maxLines: 2,
    color: [100, 116, 139],
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Official Reference: ${app.application_number}  |  Weighted Score: ${referenceScore}`,
    pageCenterX,
    183.5,
    { align: 'center' }
  );

  // Signature block
  const signatureLineY = 186.5;
  const signatureNameY = 190.5;
  const signatureTitleY = 194.5;
  const signatureColumns = [
    {
      centerX: 55,
      name: resolvedTemplateSettings.left_signatory_name,
      title: resolvedTemplateSettings.left_signatory_title,
    },
    {
      centerX: 148.5,
      name: resolvedTemplateSettings.center_signatory_name,
      title: resolvedTemplateSettings.center_signatory_title,
    },
    {
      centerX: 242,
      name: resolvedTemplateSettings.right_signatory_name,
      title: resolvedTemplateSettings.right_signatory_title,
    },
  ];

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);

  signatureColumns.forEach(({ centerX, name, title }) => {
    doc.line(centerX - 28, signatureLineY, centerX + 28, signatureLineY);

    drawColumnBlock(doc, name, centerX, signatureNameY, 62, {
      fontName: 'helvetica',
      fontStyle: 'bold',
      maxHeight: 5,
      maxFontSize: 9.5,
      minFontSize: 8,
      lineHeightFactor: 1.05,
      maxLines: 1,
      color: [15, 23, 42],
    });

    drawColumnBlock(doc, title, centerX, signatureTitleY, 68, {
      fontName: 'helvetica',
      fontStyle: 'normal',
      maxHeight: 7,
      maxFontSize: 7.5,
      minFontSize: 6.5,
      lineHeightFactor: 1.1,
      maxLines: 2,
      color: [100, 116, 139],
    });
  });

  return doc;
}

export const pdfGenerator = {
  setCertificateTemplateSettings(settings: CertificateTemplateSettings): void {
    activeCertificateTemplateSettings = normalizeCertificateTemplateSettings(settings);
  },

  // 1. Generate Official Application Summary Sheet
  generateApplicationSummary(app: Application, _award?: Award, _office?: Office): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Header banner
    doc.setFillColor(30, 58, 138); // Deep Navy / Royal Blue
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('REPUBLIC OF THE PHILIPPINES', 105, 8, { align: 'center' });
    doc.setFontSize(12);
    doc.text('CITY GOVERNMENT OF TACLOBAN', 105, 14, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('HUMAN RESOURCE MANAGEMENT AND DEVELOPMENT OFFICE (HRMDO)', 105, 20, { align: 'center' });

    // Title
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PRAISE NOMINATION SUMMARY DOSSIER', 105, 33, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Official Reference No: ${app.application_number}  |  Nomination Year: ${app.award_year}`, 105, 39, { align: 'center' });

    // Section I: Nominee Profile
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(14, 43, 196, 43);

    autoTable(doc, {
      startY: 46,
      head: [['SECTION I: NOMINEE PROFILE', 'DETAILS']],
      body: [
        ['Full Name of Nominee', app.nominee_name],
        ['Employee / Personnel ID', app.employee_id || 'N/A (Barangay / Volunteer Worker)'],
        ['Position / Official Designation', app.position_title],
        ['Department / Office', app.office_name],
        ['Division / Section', app.division_section || 'General Operations'],
        ['Employment Category', app.employment_category],
        ['Contact Number / Email', `${app.contact_number}  |  ${app.email}`],
        ['Barangay Jurisdiction', app.barangay || 'City Hall Central'],
      ],
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 }, 1: { cellWidth: 117 } },
      theme: 'grid'
    });

    // Section II: Award & Nomination Details
    // @ts-expect-error autoTable adds lastAutoTable to doc
    const currentY1 = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
      startY: currentY1,
      head: [['SECTION II: AWARD & NOMINATION PARTICULARS', 'DETAILS']],
      body: [
        ['Award Category', app.award_name || 'Tacloban PRAISE Award'],
        ['Nomination Type', app.nomination_type],
        ['Nominating Official', `${app.nominator_name} (${app.nominator_position})`],
        ['Nominating Department', app.nominating_office],
        ['Date of Nomination', app.date_of_nomination],
        ['Current System Status', `${app.status} (Stage: ${app.processing_stage})`],
        ['Weighted Evaluation Score', app.final_weighted_score ? `${app.final_weighted_score}%` : 'Assessment In Progress'],
      ],
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 }, 1: { cellWidth: 117 } },
      theme: 'grid'
    });

    // Section III: Justification & Accomplishments
    // @ts-expect-error autoTable adds lastAutoTable to doc
    const currentY2 = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
      startY: currentY2,
      head: [['SECTION III: EXECUTIVE JUSTIFICATION & IMPACT STATEMENT', '']],
      body: [
        ['Justification for Nomination', app.justification],
        ['Key Accomplishments & Impact to Taclobanons', app.accomplishments],
        ['Supporting Narrative / Heroic Acts', app.supporting_narrative],
      ],
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 122 } },
      theme: 'grid'
    });

    // Section IV: Documentary Checklist
    // @ts-expect-error autoTable adds lastAutoTable to doc
    const currentY3 = doc.lastAutoTable.finalY + 6;

    const docRows = (app.documents || []).map(d => [
      d.document_name,
      d.status,
      d.verified_by || 'Pending Verification',
      d.verification_remarks || '-'
    ]);

    if (docRows.length === 0) {
      docRows.push(['No documentary files recorded', 'N/A', 'N/A', 'N/A']);
    }

    autoTable(doc, {
      startY: currentY3,
      head: [['DOCUMENT REQUIREMENT', 'STATUS', 'VERIFIED BY', 'REMARKS']],
      body: docRows,
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 28 }, 2: { cellWidth: 44 }, 3: { cellWidth: 40 } },
      theme: 'grid'
    });

    // Section V: Official Signatures
    // @ts-expect-error autoTable adds lastAutoTable to doc
    let signY = doc.lastAutoTable.finalY + 14;
    if (signY > 250) {
      doc.addPage();
      signY = 30;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    // Three Signature columns
    doc.text('PREPARED BY (Nominator):', 14, signY);
    doc.text('VERIFIED BY (Secretariat):', 80, signY);
    doc.text('CONFIRMED BY (HRMDO Head):', 145, signY);

    doc.setFont('helvetica', 'normal');
    doc.text('_____________________________', 14, signY + 14);
    doc.text(app.nominator_name, 14, signY + 18);
    doc.setFontSize(8);
    doc.text(app.nominator_position, 14, signY + 22);

    doc.setFontSize(9);
    doc.text('_____________________________', 80, signY + 14);
    doc.text('Atty. Paul Vincent G. Yu', 80, signY + 18);
    doc.setFontSize(8);
    doc.text('PRAISE Secretariat Lead', 80, signY + 22);

    doc.setFontSize(9);
    doc.text('_____________________________', 145, signY + 14);
    doc.text('Marites S. Bocar', 145, signY + 18);
    doc.setFontSize(8);
    doc.text('City Gov Dept Head II, HRMDO', 145, signY + 22);

    // Save
    doc.save(`${app.application_number}_Summary_Dossier.pdf`);
  },

  // 2. Generate Evaluation Matrix & Deliberation Ranking Report
  generateEvaluationMatrixReport(applications: Application[], awardName: string = 'All Awards'): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Header
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 297, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('CITY GOVERNMENT OF TACLOBAN - PRAISE COMMITTEE', 148.5, 8, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL EVALUATION & RANKING DELIBERATION MATRIX', 148.5, 14, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })} | Category: ${awardName}`, 148.5, 19, { align: 'center' });

    // Table Data
    const tableData = applications.map((app, index) => {
      const evalCount = app.evaluations?.length || 0;
      const evaluatorsList = (app.evaluations || []).map(e => `${e.evaluator_name}: ${e.weighted_percentage || e.total_score || 0}%`).join('\n') || 'None';

      return [
        index + 1,
        app.application_number,
        app.nominee_name,
        app.position_title,
        app.office_name,
        app.award_name,
        evalCount > 0 ? evaluatorsList : 'Pending Assessment',
        app.final_weighted_score ? `${app.final_weighted_score}%` : 'N/A',
        app.status,
        app.deliberation_decision || 'Pending Deliberation'
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [['#', 'APP NO.', 'NOMINEE NAME', 'DESIGNATION', 'DEPARTMENT / OFFICE', 'AWARD CATEGORY', 'EVALUATOR BREAKDOWN', 'FINAL SCORE', 'STATUS', 'COMMITTEE DECISION']],
      body: tableData,
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 28 },
        2: { cellWidth: 34, fontStyle: 'bold' },
        3: { cellWidth: 28 },
        4: { cellWidth: 34 },
        5: { cellWidth: 38 },
        6: { cellWidth: 44 },
        7: { cellWidth: 18, fontStyle: 'bold' },
        8: { cellWidth: 22 },
        9: { cellWidth: 26, fontStyle: 'bold' }
      },
      theme: 'grid'
    });

    // Signoffs
    // @ts-expect-error autoTable adds lastAutoTable to doc
    const lastY = doc.lastAutoTable.finalY + 12;
    const finalSignY = lastY > 175 ? 180 : lastY;

    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('PRAISE COMMITTEE CHAIRPERSON:', 20, finalSignY);
    doc.text('HRMDO HEAD / SECRETARIAT:', 110, finalSignY);
    doc.text('CITY MAYOR (APPROVED BY):', 200, finalSignY);

    doc.setFont('helvetica', 'normal');
    doc.text('________________________________', 20, finalSignY + 10);
    doc.text('ATTY. IRENE V. CHIU', 20, finalSignY + 14);
    doc.text('City Administrator / PRAISE Chair', 20, finalSignY + 18);

    doc.text('________________________________', 110, finalSignY + 10);
    doc.text('MARITES S. BOCAR', 110, finalSignY + 14);
    doc.text('Head, HRMDO Tacloban', 110, finalSignY + 18);

    doc.text('________________________________', 200, finalSignY + 10);
    doc.text('HON. ALFRED S. ROMUALDEZ', 200, finalSignY + 14);
    doc.text('City Mayor, Tacloban City', 200, finalSignY + 18);

    doc.save(`Tacloban_PRAISE_Deliberation_Matrix_${new Date().getFullYear()}.pdf`);
  },

  // 3. Generate Printable Certificate of Recognition / Award
  async generateAwardCertificate(
    app: Application,
    _award?: Award,
    templateOverride?: Partial<CertificateTemplateSettings>
  ): Promise<void> {
    const doc = await buildAwardCertificateDoc(app, templateOverride);
    doc.save(`${app.application_number}_Certificate_of_Recognition.pdf`);
  },

  async generateAwardCertificatePreviewBlob(
    app: Application,
    _award?: Award,
    templateOverride?: Partial<CertificateTemplateSettings>
  ): Promise<Blob> {
    const doc = await buildAwardCertificateDoc(app, templateOverride);
    return doc.output('blob');
  }
};
