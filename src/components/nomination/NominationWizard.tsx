import React, { useRef, useState } from 'react';
import { Application, Award, NominationRevisionDraft, Office, UserProfile } from '../../types';
import { praiseService } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Award as AwardIcon, 
  User, 
  Building2, 
  FileCheck, 
  Sparkles,
  Download,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SignaturePad, SignatureStrokes } from './SignaturePad';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { RevisionInstructions } from './NominationRevisionControls';
import { RevisionAttachmentList } from './RevisionAttachmentList';
import { WrappingSelect } from '../common/WrappingSelect';
import {
  clearNominationDraft,
  clearNominationDraftFiles,
  NominationDraftData,
  readNominationDraft,
  readNominationDraftFiles,
  saveNominationDraft,
  saveNominationDraftFile,
} from '../../lib/nominationDraft';

interface NominationWizardProps {
  awards: Award[];
  offices: Office[];
  currentUser: UserProfile;
  onNominationComplete: (appId: string) => void;
  onCancel: () => void;
  modal?: boolean;
  revision?: { application: Application; draft: NominationRevisionDraft };
}

type UploadedRequirement = {
  requirement_id?: string;
  requirement_name: string;
  file?: File;
  file_size?: number;
  file_type?: string;
  is_mandatory: boolean;
  is_uploaded: boolean;
};

function createSubmissionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function awardOptionLabel(award: Award) {
  const code = `(${award.code})`;
  const name = award.name.endsWith(code) ? award.name : `${award.name} ${code}`;
  return award.is_on_the_spot ? `[ON-THE-SPOT] ${name}` : name;
}

function officeOptionLabel(office: Office) {
  return `${office.name} (${office.code})`;
}

function LocalAttachmentPreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  React.useEffect(() => {
    const previewUrl = URL.createObjectURL(file);
    setUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [file]);
  return url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-xs font-semibold text-blue-700 underline">Preview file</a> : null;
}

export const NominationWizard: React.FC<NominationWizardProps> = ({
  awards,
  offices,
  currentUser,
  onNominationComplete,
  onCancel,
  modal = false,
  revision,
}) => {
  offices = offices.filter(office => office.is_active);
  const [revisionDraft, setRevisionDraft] = useState(revision?.draft);
  const revisionApplication = revision?.application;
  const detailsLocked = revisionDraft?.request.scope === 'attachments';
  const restoredDraft = React.useMemo(() => {
    if (revision) {
      const saved = { ...revision.application, ...revision.draft.details } as Application;
      return {
        submissionId: undefined, step: 1 as const, selectedAwardId: saved.award_id,
        nomineeName: saved.nominee_name, employeeId: saved.employee_id, positionTitle: saved.position_title,
        officeId: saved.office_id, divisionSection: saved.division_section, employmentCategory: saved.employment_category,
        contactNumber: saved.contact_number, email: saved.email, barangay: saved.barangay, nominationType: saved.nomination_type,
        nominatorName: saved.nominator_name, nominatorPosition: saved.nominator_position, nominatingOffice: saved.nominating_office,
        nominatingOfficeId: saved.nominating_office_id, selfNomination: saved.nomination_origin === 'Self-Nominated' || saved.nominee_id === currentUser.id,
        justification: saved.justification, accomplishments: saved.accomplishments, supportingNarrative: saved.supporting_narrative,
      };
    }

    const draft = readNominationDraft(currentUser.id);
    const server = draft?.submissionId ? praiseService.getApplications().find(application => application.id === `app-${draft.submissionId}` && application.status === 'Draft') : undefined;
    if (!draft || !server) return draft;
    return { ...draft, selectedAwardId: server.award_id, nomineeName: server.nominee_name, employeeId: server.employee_id || '', positionTitle: server.position_title, officeId: server.office_id, divisionSection: server.division_section || '', employmentCategory: server.employment_category, contactNumber: server.contact_number, email: server.email, barangay: server.barangay || '', nominationType: server.nomination_type, nominatorName: server.nominator_name, nominatorPosition: server.nominator_position, nominatingOffice: server.nominating_office, nominatingOfficeId: server.nominating_office_id, selfNomination: server.nomination_origin === 'Self-Nominated', justification: server.justification, accomplishments: server.accomplishments, supportingNarrative: server.supporting_narrative };
  }, [currentUser.id, revision]);
  const [submissionId] = useState(() => revision ? '' : restoredDraft?.submissionId || createSubmissionId());
  const serverDraft = praiseService.getApplications().find(application => application.id === `app-${submissionId}` && application.status === 'Draft');
  const legacyDraft = Boolean((revisionApplication || serverDraft) && !(revisionApplication || serverDraft)?.nomination_origin);

  const restoredAwardId = restoredDraft && awards.some(award => award.id === restoredDraft.selectedAwardId)
    ? restoredDraft.selectedAwardId
    : revisionApplication ? restoredDraft?.selectedAwardId || '' : awards[0]?.id || '';
  const restoredOfficeId = restoredDraft && offices.some(office => office.id === restoredDraft.officeId)
    ? restoredDraft.officeId
    : revisionApplication ? restoredDraft?.officeId || '' : currentUser.office_id || offices[0]?.id || '';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(restoredDraft?.step || 1);

  // Form State
  const [selectedAwardId, setSelectedAwardId] = useState(restoredAwardId);
  
  // Nominee Info
  const [nomineeName, setNomineeName] = useState(restoredDraft?.nomineeName || '');
  const [employeeId, setEmployeeId] = useState(restoredDraft?.employeeId || '');
  const [positionTitle, setPositionTitle] = useState(restoredDraft?.positionTitle || '');
  const [officeId, setOfficeId] = useState(restoredOfficeId);
  const [divisionSection, setDivisionSection] = useState(restoredDraft?.divisionSection || '');
  const [employmentCategory, setEmploymentCategory] = useState<'Permanent' | 'Casual' | 'Contractual' | 'Job Order' | 'Barangay Official' | 'Barangay Worker'>(restoredDraft?.employmentCategory || 'Permanent');
  const [contactNumber, setContactNumber] = useState(restoredDraft?.contactNumber || '');
  const [email, setEmail] = useState(restoredDraft?.email || '');
  const [barangay, setBarangay] = useState(restoredDraft?.barangay || '');

  // Nomination Details
  const [nominationType, setNominationType] = useState<'Individual' | 'Group / Team'>(restoredDraft?.nominationType || 'Individual');
  const [nominatorName, setNominatorName] = useState(restoredDraft?.nominatorName || currentUser.full_name);
  const [nominatorPosition, setNominatorPosition] = useState(restoredDraft?.nominatorPosition || currentUser.position_title || 'Nominator');
  const [nominatingOffice, setNominatingOffice] = useState(restoredDraft?.nominatingOffice || currentUser.office_name || 'City Government of Tacloban');
  const [nominatingOfficeId, setNominatingOfficeId] = useState(restoredDraft?.nominatingOfficeId || currentUser.office_id || '');
  const [selfNomination, setSelfNomination] = useState(restoredDraft?.selfNomination || false);
  const [signatureStrokes, setSignatureStrokes] = useState<SignatureStrokes>([]);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [justification, setJustification] = useState(restoredDraft?.justification || '');
  const [accomplishments, setAccomplishments] = useState(restoredDraft?.accomplishments || '');
  const [supportingNarrative, setSupportingNarrative] = useState(restoredDraft?.supportingNarrative || '');

  const originLabel = legacyDraft ? 'Not recorded (historical nomination)' : selfNomination ? 'Self-Nominated' : 'Nominated by Others';

  // Uploaded Documents
  const [uploadedDocs, setUploadedDocs] = useState<UploadedRequirement[]>([]);

  const [submittedApp, setSubmittedApp] = useState<Application | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isRestoringFiles, setIsRestoringFiles] = useState(true);
  const [revisionRemarks, setRevisionRemarks] = useState(revision?.draft.remarks || '');
  const [savingRevision, setSavingRevision] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const submissionInProgress = useRef(false);
  const createdApplicationRef = useRef<Application | null>(serverDraft || null);
  const uploadedDocumentKeys = useRef(new Set<string>());

  const selectedAward = awards.find(a => a.id === selectedAwardId) || (revision ? undefined : awards[0]);
  const selectedOffice = offices.find(office => office.id === officeId);
  const selectedOfficeObj = selectedOffice || (revision ? undefined : offices[0]);
  const nominatingOfficeObj = offices.find(office => office.id === nominatingOfficeId);
  const hasServerDraft = Boolean(createdApplicationRef.current)
    || praiseService.getApplications().some(application => application.id === `app-${submissionId}` && application.status === 'Draft');

  React.useEffect(() => {
    if (submittedApp || revision) return;

    const draft: NominationDraftData = {
      version: 1,
      submissionId,
      saved_at: new Date().toISOString(),
      step,
      selectedAwardId,
      nomineeName,
      employeeId,
      positionTitle,
      officeId,
      divisionSection,
      employmentCategory,
      contactNumber,
      email,
      barangay,
      nominationType,
      nominatorName,
      nominatorPosition,
      nominatingOffice,
      nominatingOfficeId,
      selfNomination,
      justification,
      accomplishments,
      supportingNarrative,
    };

    try {
      saveNominationDraft(currentUser.id, draft);
    } catch (error) {
      console.warn('Unable to save the nomination draft.', error);
    }
  }, [
    accomplishments,
    barangay,
    contactNumber,
    currentUser.id,
    divisionSection,
    email,
    employeeId,
    employmentCategory,
    justification,
    nomineeName,
    nominationType,
    nominatingOffice,
    nominatingOfficeId,
    selfNomination,
    nominatorName,
    nominatorPosition,
    officeId,
    positionTitle,
    selectedAwardId,
    step,
    submissionId,
    submittedApp,
    supportingNarrative,
    revision,
  ]);

  // Update document requirements when award changes
  React.useEffect(() => {
    if (revision) { setIsRestoringFiles(false); return; }
    let cancelled = false;
    setIsRestoringFiles(true);
    const requirements = selectedAward?.document_requirements || [];
    const emptyRequirements = requirements.map(req => ({
      requirement_id: req.id,
      requirement_name: req.document_name,
      file_size: 0,
      file_type: 'application/pdf',
      is_mandatory: req.is_mandatory,
      is_uploaded: false,
    }));

    setUploadedDocs(emptyRequirements);

    if (!selectedAwardId || requirements.length === 0) {
      setIsRestoringFiles(false);
      return () => { cancelled = true; };
    }

    void readNominationDraftFiles(currentUser.id, selectedAwardId)
      .then(savedFiles => {
        if (cancelled) return;
        setUploadedDocs(requirements.map(req => {
          const file = savedFiles.get(req.id);
          return {
            requirement_id: req.id,
            requirement_name: req.document_name,
            file,
            file_size: file?.size || 0,
            file_type: file?.type || 'application/pdf',
            is_mandatory: req.is_mandatory,
            is_uploaded: Boolean(file),
          };
        }));
        setIsRestoringFiles(false);
      })
      .catch(error => {
        console.warn('Unable to restore nomination draft attachments.', error);
        if (!cancelled) setIsRestoringFiles(false);
      });

    return () => { cancelled = true; };
  }, [currentUser.id, selectedAwardId, selectedAward?.document_requirements, revision]);

  const handleFileUpload = (reqId: string, docName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.(pdf|docx|jpe?g|png)$/i.test(file.name)) {
      setErrorMessage('Unsupported file type. Please upload a PDF, DOCX, JPG, JPEG, or PNG file.');
      e.target.value = '';
      return;
    }

    if (file.size === 0) {
      setErrorMessage('The selected attachment is empty. Please choose a valid file.');
      return;
    }

    // Check size limit (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File is too large. Maximum file size is 10 MB.');
      e.target.value = '';
      return;
    }

    uploadedDocumentKeys.current.delete(reqId || docName);

    setUploadedDocs(prev => prev.map(doc => {
      if (doc.requirement_id === reqId || doc.requirement_name === docName) {
        return {
          ...doc,
          requirement_name: docName,
          file,
          file_size: file.size,
          file_type: file.type || 'application/pdf',
          is_uploaded: true
        };
      }
      return doc;
    }));

    void saveNominationDraftFile(currentUser.id, selectedAwardId, reqId || docName, file)
      .catch(error => {
        console.warn('Unable to save the nomination draft attachment.', error);
      });
  };

  const clearSavedDraft = async () => {
    clearNominationDraft(currentUser.id);
    try {
      await clearNominationDraftFiles(currentUser.id);
    } catch (error) {
      console.warn('Unable to clear nomination draft attachments.', error);
    }
  };

  const revisionDetails = {
    award_id: selectedAwardId, ...(revisionApplication?.nominee_id ? {} : { nominee_name: nomineeName.trim() }),
    employee_id: employeeId.trim(), position_title: positionTitle.trim(), office_id: officeId,
    division_section: divisionSection.trim(), employment_category: employmentCategory, contact_number: contactNumber.trim(),
    email: email.trim(), barangay, nomination_type: nominationType, nominator_name: nominatorName.trim(),
    nominator_position: nominatorPosition.trim(), ...(legacyDraft && !revisionApplication?.nominating_office_id ? {} : { nominating_office_id: nominatingOfficeId }),
    justification: justification.trim(), accomplishments: accomplishments.trim(), supporting_narrative: supportingNarrative.trim(),
  };
  const serializedDraft = JSON.stringify({ details: detailsLocked ? undefined : revisionDetails, remarks: revisionRemarks });
  const savedDraft = useRef(serializedDraft);
  const isRevisionDirty = Boolean(revision && savedDraft.current !== serializedDraft);

  React.useEffect(() => {
    if (!isRevisionDirty || submittedApp) return;
    const warnUnsaved = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, [isRevisionDirty, submittedApp]);

  const saveRevision = async () => {
    if (!revisionApplication || !revisionDraft || !isRevisionDirty) return revisionDraft;
    setSavingRevision(true);
    try {
      const result = await praiseService.nominationRevision(revisionApplication.id, 'save_nomination_revision', {
        revision_id: revisionDraft.request.id, generation: revisionDraft.generation, remarks: revisionRemarks,
        ...(detailsLocked ? {} : { details: revisionDetails }),
      });
      if (!result.draft) throw new Error('This revision is no longer active.');
      savedDraft.current = serializedDraft;
      setRevisionDraft(result.draft);
      return result.draft;
    } finally {
      setSavingRevision(false);
    }
  };

  const reportRevisionError = (error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Unable to save this revision.');

  const changeRevisionAttachment = async (requirementId: string, file?: File) => {
    if (!revisionApplication || !revisionDraft || savingRevision) return;
    if (file && (!/\.(pdf|docx|jpe?g|png)$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024)) {
      setErrorMessage('Choose a non-empty PDF, DOCX, JPG, JPEG, or PNG file up to 10 MB.');
      return;
    }
    setSavingRevision(true);
    setErrorMessage('');
    try {
      if (file) {
        setRevisionDraft(await praiseService.stageNominationRevisionFile(revisionApplication.id, revisionDraft, requirementId, file));
      } else {
        const result = await praiseService.nominationRevision(revisionApplication.id, 'remove_revision_attachment', {
          revision_id: revisionDraft.request.id, generation: revisionDraft.generation,
          ...(requirementId.startsWith('document:') ? { document_id: requirementId.slice('document:'.length) } : { requirement_id: requirementId }),
        });
        if (!result.draft) throw new Error('This revision is no longer active.');
        setRevisionDraft(result.draft);
      }
    } catch (error) {
      reportRevisionError(error);
    } finally {
      setSavingRevision(false);
    }
  };

  const handleCancel = async () => {
    if (submissionInProgress.current || savingRevision) return;
    if (revision) {
      try { await saveRevision(); }
      catch (error) { reportRevisionError(error); return; }
    } else if (!hasServerDraft) await clearSavedDraft();
    onCancel();
  };

  const closeDialog = useRef(() => {});
  closeDialog.current = () => {
    if (revision) void handleCancel();
    else if (!submissionInProgress.current) onCancel();
  };
  const isDialog = modal || Boolean(revision);
  React.useEffect(() => {
    if (!isDialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog.current();
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const controls = [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary') || [])]
        .filter(control => control.getClientRects().length);
      if (!controls.length) return;
      const active = document.activeElement;
      const atBoundary = event.shiftKey
        ? active === controls[0] || active === dialog || active === headingRef.current
        : active === controls.at(-1);
      if (atBoundary || !dialog?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isDialog]);

  const titleId = React.useId();
  const dialogProps = isDialog ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, tabIndex: -1 } as const : {};
  React.useEffect(() => {
    if (isDialog) {
      headingRef.current?.closest('#nomination-wizard-container, #nomination-success-card')?.scrollIntoView({ block: 'start', inline: 'nearest' });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [isDialog, step, submittedApp]);
  const errorRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (errorMessage) errorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [errorMessage]);

  // Validation
  const validateStep1 = () => {
    if (detailsLocked) return '';
    if (!nominatorName.trim()) return 'Nominator full name is required.';
    if (!legacyDraft && !offices.some(office => office.id === nominatingOfficeId)) return 'Choose an active nominator office.';
    if (!offices.some(office => office.id === officeId)) return 'Choose an active nominee office.';
    if (selfNomination && nominationType !== 'Individual') return 'Self-nomination requires the Individual category.';
    if (!selectedAwardId) return 'Please select an award category.';
    if (!nomineeName.trim()) return 'Nominee full name is required.';
    if (!positionTitle.trim()) return 'Position / Designation is required.';
    if (!contactNumber.trim()) return 'Contact number is required.';
    if (!email.trim()) return 'Email address is required.';
    return '';
  };

  const validateStep2 = () => {
    if (detailsLocked) return '';
    if (!justification.trim() || justification.length < 20) {
      return 'Please provide a thorough justification for the nomination (minimum 20 characters).';
    }
    if (!accomplishments.trim() || accomplishments.length < 20) {
      return 'Please detail the nominee\'s key accomplishments and impact.';
    }
    if (!supportingNarrative.trim()) {
      return 'Supporting narrative / background is required.';
    }
    return '';
  };

  const validateStep3 = () => {
    if (isRestoringFiles) return 'Please wait while saved attachments are restored.';
    if (revisionApplication && revisionDraft) {
      for (const requirement of selectedAward?.document_requirements || []) {
        if (!requirement.is_mandatory) continue;
        const file = revisionDraft.attachments[requirement.id];
        const existing = revisionApplication.documents?.find(document => document.requirement_id === requirement.id);
        if (!(file === undefined ? existing : file)?.file_url) {
          return revisionDraft.request.scope === 'details'
            ? 'A required attachment is missing. Ask the Administrator to authorize attachment changes.'
            : `Mandatory document missing: ${requirement.document_name}`;
        }
      }
      return '';
    }
    const mandatoryReqs = uploadedDocs.filter(doc => doc.is_mandatory);
    for (const req of mandatoryReqs) {
      if (!req.is_uploaded || !req.file || req.file.size === 0) {
        return `Mandatory Document Missing: "${req.requirement_name}". Please attach all required files.`;
      }
    }
    return '';
  };

  const handleNext = async () => {
    setErrorMessage('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setErrorMessage(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2();
      if (err) { setErrorMessage(err); return; }
      try { await saveRevision(); }
      catch (error) { reportRevisionError(error); return; }
      setStep(3);
    } else if (step === 3) {
      const err = validateStep3();
      if (err) { setErrorMessage(err); return; }
      setStep(4);
    }
  };

  const handleSubmitNomination = async () => {
    if (submissionInProgress.current) return;
    const formError = validateStep1() || validateStep2();
    if (formError) { setErrorMessage(formError); return; }
    if (!signatureConfirmed || !signatureStrokes.length) { setErrorMessage('Draw your signature and check box for confirmation.'); return; }
    const attachmentError = validateStep3();
    if (attachmentError) {
      setStep(3);
      setErrorMessage(attachmentError);
      return;
    }
    submissionInProgress.current = true;
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      if (revisionApplication && revisionDraft) {
        const draft = await saveRevision();
        const result = await praiseService.nominationRevision(revisionApplication.id, 'finalize_nomination_revision', {
          revision_id: revisionDraft.request.id, generation: draft?.generation,
          signature_strokes: signatureStrokes, signature_confirmed: signatureConfirmed, remarks: revisionRemarks.trim(),
        });
        setSubmittedApp(result.application);
        showToast(`Nomination ${result.application.application_number} revised and resubmitted.`);
        return;
      }
      const createdApplication = createdApplicationRef.current || await praiseService.submitNomination({
        submission_id: submissionId,
        award_id: selectedAwardId,
        nominee_id: selfNomination ? currentUser.id : undefined,
        self_nomination: selfNomination,
        nominee_name: nomineeName.trim(),
        employee_id: employeeId.trim(),
        position_title: positionTitle.trim(),
        office_id: officeId,
        office_name: selectedOfficeObj?.name || 'City Government of Tacloban',
        division_section: divisionSection.trim(),
        employment_category: employmentCategory,
        contact_number: contactNumber.trim(),
        email: email.trim(),
        barangay: barangay,
        nomination_type: nominationType,
        nominating_office_id: nominatingOfficeId,
        nominator_name: nominatorName.trim() || currentUser.full_name,
        nominator_position: nominatorPosition.trim() || 'Nominator',
        nominating_office: nominatingOffice.trim() || selectedOfficeObj?.name || 'City Government of Tacloban',
        justification: justification.trim(),
        accomplishments: accomplishments.trim(),
        supporting_narrative: supportingNarrative.trim()
      });
      createdApplicationRef.current = createdApplication;

      const selectedDocuments = uploadedDocs.filter(document => Boolean(document.file));
      for (const [index, document] of selectedDocuments.entries()) {
        const documentKey = document.requirement_id || document.requirement_name;
        if (document.file && !uploadedDocumentKeys.current.has(documentKey)) {
          setUploadProgress(`Uploading attachment ${index + 1} of ${selectedDocuments.length}...`);
          await praiseService.uploadApplicationDocument(
            createdApplication.id,
            document.file,
            document.requirement_name,
            document.requirement_id,
            undefined,
            false
          );
          uploadedDocumentKeys.current.add(documentKey);
        }
      }

      setUploadProgress('Verifying all attachments...');
      const finalizedApplication = await praiseService.finalizeNomination(
        createdApplication.id,
        selectedDocuments.map(document => document.requirement_id || document.requirement_name),
        signatureStrokes,
        signatureConfirmed
      );
      await clearSavedDraft();
      setSubmittedApp(finalizedApplication);
      showToast(`Nomination ${finalizedApplication.application_number} submitted successfully.`);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An error occurred while submitting the nomination.';
      if (createdApplicationRef.current) {
        setErrorMessage(`Nomination ${createdApplicationRef.current.application_number} is saved as a draft. ${message} Retry submission to finish the attachments.`);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress('');
      submissionInProgress.current = false;
    }
  };

  // If submitted successfully
  if (submittedApp) {
    return (
      <div ref={dialogRef} {...dialogProps} id="nomination-success-card" className="relative mx-auto max-w-3xl bg-white rounded-xl p-4 sm:p-8 border border-slate-200 shadow-xs text-center space-y-6 wrap-anywhere">
        {modal && !revision && <button type="button" aria-label="Close nomination form" onClick={() => closeDialog.current()} className="absolute top-2 right-2 grid size-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><X size={18} /></button>}
        <div className="w-16 h-16 bg-green-50 text-green-700 rounded-full flex items-center justify-center mx-auto ring-8 ring-green-50">
          <Sparkles size={32} />
        </div>

        <div>
          <h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-2xl font-bold text-slate-900">{revision ? 'Revised Nomination Submitted' : 'Nomination Successfully Filed!'}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Your nomination has been recorded in the City of Tacloban PRAISE System.
          </p>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50 rounded-xl border border-slate-200 text-left max-w-lg mx-auto space-y-3">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
            <span className="text-xs font-semibold text-slate-500">Official Reference No.</span>
            <span className="text-sm font-bold text-blue-700 font-mono">
              {submittedApp.application_number}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-semibold text-slate-500">Nominee Name:</span>
            <span className="text-xs font-bold text-slate-900">{submittedApp.nominee_name}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-semibold text-slate-500">Award Category:</span>
            <span className="text-xs font-bold text-slate-900">{submittedApp.award_name}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-semibold text-slate-500">Next Action:</span>
            <span className="text-xs font-medium text-amber-700">{submittedApp.required_action}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <button
            id="download-summary-dossier-btn"
            onClick={() => {
              if (!revision) pdfGenerator.generateApplicationSummary(submittedApp, selectedAward, selectedOfficeObj);
              else void import('../../lib/nominationPdf').then(({ downloadNominationPdf }) => downloadNominationPdf(submittedApp.id, currentUser.role))
                .catch(error => showToast(error instanceof Error ? error.message : 'Unable to download the revised nomination.', 'error'));
            }}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={15} />
            <span>Download Summary Form A-1 (PDF)</span>
          </button>

          <button
            id="view-application-dashboard-btn"
            onClick={() => onNominationComplete(submittedApp.id)}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Go to Application Tracking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={dialogRef} {...dialogProps} id="nomination-wizard-container" className="@container mx-auto w-full min-w-0 max-w-4xl bg-white rounded-xl border border-slate-200 shadow-xs wrap-anywhere">
      {/* Wizard Header */}
      <div className="flex items-start justify-between gap-3 rounded-t-[inherit] bg-slate-900 px-3 py-4 text-white sm:px-6 sm:py-5">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Official Form A-1</span>
          <h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-lg font-bold text-white">{revision ? 'Revise Nomination' : 'Tacloban PRAISE Nomination Portal'}</h2>
          <p className="text-xs text-slate-300 mt-0.5">Step {step} of 4: {
            step === 1 ? 'Nominee Profile & Award' :
            step === 2 ? 'Justification & Accomplishments' :
            step === 3 ? 'Documentary Requirements' : 'Review & Confirm'
          }</p>
        </div>

        {/* Step Indicator Badges */}
        <div aria-hidden="true" className="hidden shrink-0 items-center gap-2 self-center @md:flex">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step === s
                  ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                  : step > s
                  ? 'bg-slate-700 text-slate-200'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
          ))}
        </div>
        {modal && !revision && <button type="button" aria-label="Close nomination form" onClick={() => closeDialog.current()} disabled={isSubmitting} className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X size={18} /></button>}
        {revision && <button type="button" title="Save and close revision" aria-label="Save and close revision" onClick={() => closeDialog.current()} disabled={isSubmitting || savingRevision} className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X size={18} /></button>}
      </div>

      {/* Error notification banner */}
      {errorMessage && (
        <div ref={errorRef} role="alert" className="mx-3 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-700 sm:mx-6">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {restoredDraft && (
        <div className="mx-3 mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 sm:mx-6">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <p className="font-bold">Your saved nomination draft was restored.</p>
            <p className="mt-0.5 text-blue-700">
              You can continue from Step {restoredDraft.step}. Changes and selected attachments are saved automatically in this browser.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-5 p-3 @lg:p-6 @2xl:p-8">
        {revisionApplication && <RevisionInstructions application={revisionApplication} />}
        {revisionApplication && <p className="mb-4 mt-3 text-xs text-slate-600">Application {revisionApplication.application_number}. The original submitting account, nominee account link, and self-nomination classification are fixed. The official nomination stays on record until you sign and submit your changes.</p>}

        {/* STEP 1: NOMINEE PROFILE & AWARD SELECTION */}
        {step === 1 && (
          <fieldset disabled={hasServerDraft || isSubmitting || savingRevision || detailsLocked} className="space-y-6">
            <div>
              <label htmlFor="award-category-select" className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                1. Select Award Category *
              </label>
              <div className="rounded-xl border border-slate-300 bg-slate-50 transition-colors focus-within:border-blue-600 focus-within:bg-white">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1 px-2 py-1 font-semibold @lg:gap-2 @lg:px-3">
                  <AwardIcon size={17} className="shrink-0 text-blue-600" />
                  <WrappingSelect
                    id="award-category-select"
                    required
                    value={selectedAwardId}
                    displayValue={selectedAward ? awardOptionLabel(selectedAward) : awards.length ? 'Select an award' : 'No active awards available'}
                    aria-describedby={selectedAward?.description?.trim() ? 'wizard-award-description' : undefined}
                    onChange={event => setSelectedAwardId(event.target.value)}
                  >
                    {awards.length === 0 && <option value="">No active awards available</option>}
                    {awards.map(award => (
                      <option key={award.id} value={award.id}>{awardOptionLabel(award)}</option>
                    ))}
                  </WrappingSelect>
                </div>

                {selectedAward?.description?.trim() && (
                  <div id="wizard-award-description" className="border-t border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-600">
                    {selectedAward.description}
                  </div>
                )}
              </div>
            </div>

            {selectedAward?.is_on_the_spot && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
                <AwardIcon size={17} className="mt-0.5 shrink-0 text-red-700" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide">On-the-Spot Award</p>
                  <p className="mt-0.5 text-xs leading-relaxed">
                    Special recognition for an employee or group demonstrating honesty, bravery, or courage in the performance of their work.
                  </p>
                </div>
              </div>
            )}

            {/* Award Eligibility Checklist */}
            {Boolean(selectedAward?.eligibility_requirements?.length) && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-800 mb-2">
                  Award Minimum Eligibility Standards:
                </h4>
                <ul className="text-xs text-slate-600 space-y-1">
                  {selectedAward.eligibility_requirements.map(el => (
                    <li key={el.id} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-green-700 shrink-0 mt-0.5" />
                      <span>{el.requirement_description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedAward?.remarks?.trim() && (
              <div className="p-3 @lg:p-4 bg-amber-50 rounded-xl border border-amber-200">
                <h4 className="text-xs font-bold text-amber-900 mb-1.5 flex items-center gap-2">
                  <FileText size={14} className="shrink-0" />
                  <span>Award Notes</span>
                </h4>
                <p className="text-sm leading-relaxed text-amber-900 whitespace-pre-wrap">
                  {selectedAward.remarks}
                </p>
              </div>
            )}

            {/* Nominee Details Form */}
            <div className="pt-4 border-t border-slate-200">
              <section className="mb-6 space-y-3 border-b border-slate-200 pb-6">
                <h3 className="text-sm font-bold text-slate-900">Nominator Information</h3>
                <p className="text-xs text-slate-600">Account used: {currentUser.full_name} ({currentUser.role}). Correct your displayed name as needed; you must sign personally.</p>
                <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor="wizard-nominator-name" className="block text-xs font-semibold">Full Name *</label>
                    <textarea id="wizard-nominator-name" required autoComplete="name" rows={2} value={nominatorName}
                      onChange={event => setNominatorName(event.target.value.replace(/[\r\n]/g, ''))}
                      className="mt-1 block min-h-11 w-full resize-y field-sizing-content rounded-md border border-slate-300 bg-slate-50 p-2.5 text-sm" />
                  </div>
                  {legacyDraft ? <div className="text-xs font-semibold">Office / Department
                    <p className="mt-1 rounded-md border border-slate-300 bg-slate-100 p-2.5 text-sm">{nominatingOffice}</p>
                  </div> : <label className="min-w-0 text-xs font-semibold">Office / Department *
                    <span className="mt-1 block rounded-md border border-slate-300 bg-slate-50">
                      <WrappingSelect required value={nominatingOfficeId}
                        displayValue={nominatingOfficeObj ? officeOptionLabel(nominatingOfficeObj) : nominatingOffice || 'Select office'}
                        onChange={event => { setNominatingOfficeId(event.target.value); setNominatingOffice(offices.find(office => office.id === event.target.value)?.name || ''); }}>
                        <option value="">Select office</option>
                        {nominatingOfficeId && !nominatingOfficeObj && <option value={nominatingOfficeId} disabled>{nominatingOffice}</option>}
                        {offices.map(office => <option key={office.id} value={office.id}>{officeOptionLabel(office)}</option>)}
                      </WrappingSelect>
                    </span>
                  </label>}
                  <label className="text-xs font-semibold">Position / Designation<input value={nominatorPosition} onChange={event => setNominatorPosition(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 p-2.5" /></label>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={selfNomination} disabled={Boolean(revision)} onChange={event => {
                  const self = event.target.checked; setSelfNomination(self);
                  if (self) { setNomineeName(currentUser.full_name); setEmployeeId(currentUser.employee_id || ''); setPositionTitle(currentUser.position_title || ''); setOfficeId(currentUser.office_id || ''); setContactNumber(currentUser.contact_number || ''); setEmail(currentUser.email); setNominationType('Individual'); }
                  else { setNomineeName(''); setEmployeeId(''); setPositionTitle(''); setOfficeId(''); setContactNumber(''); setEmail(''); }
                }} />I am nominating myself using my own account</label>
                <p className="text-xs text-slate-500">{originLabel}{!legacyDraft && !selfNomination && ': the nominee can be an individual without a PRAISE account.'}</p>
              </section>
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <User size={16} className="text-blue-600" />
                <span>Nominee Information</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <div>
                  <label htmlFor="wizard-nominee-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name of Nominee *
                  </label>
                  <textarea
                    id="wizard-nominee-name"
                    rows={2}
                    required
                    placeholder="e.g. Juan P. Dela Cruz"
                    disabled={selfNomination || Boolean(revisionApplication?.nominee_id)}
                    value={nomineeName}
                    onChange={event => setNomineeName(event.target.value.replace(/[\r\n]/g, ''))}
                    className="block min-h-11 w-full resize-y field-sizing-content text-sm p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="wizard-employee-id" className="block text-xs font-semibold text-slate-700 mb-1">
                    Employee / Personnel ID
                  </label>
                  <input
                    id="wizard-employee-id"
                    type="text"
                    placeholder="e.g. TAC-2024-001 or N/A"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="wizard-position" className="block text-xs font-semibold text-slate-700 mb-1">
                    Position / Designation *
                  </label>
                  <input
                    id="wizard-position"
                    type="text"
                    required
                    placeholder="e.g. Administrative Officer IV / BHW"
                    value={positionTitle}
                    onChange={e => setPositionTitle(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="wizard-nominee-office" className="block text-xs font-semibold text-slate-700 mb-1">
                    Department / Office *
                  </label>
                  <div className="rounded-md border border-slate-300 bg-slate-50">
                    <WrappingSelect id="wizard-nominee-office" required value={officeId}
                      displayValue={selectedOffice ? officeOptionLabel(selectedOffice) : officeId && revisionApplication?.office_name || 'Select office'}
                      onChange={event => setOfficeId(event.target.value)}>
                      <option value="">Select office</option>
                      {revisionApplication && officeId === revisionApplication.office_id && !selectedOfficeObj && <option value={officeId} disabled>{revisionApplication.office_name}</option>}
                      {offices.map(office => <option key={office.id} value={office.id}>{officeOptionLabel(office)}</option>)}
                    </WrappingSelect>
                  </div>
                </div>

                <div>
                  <label htmlFor="wizard-division" className="block text-xs font-semibold text-slate-700 mb-1">
                    Division / Section
                  </label>
                  <input
                    id="wizard-division"
                    type="text"
                    placeholder="e.g. Primary Health Services Unit"
                    value={divisionSection}
                    onChange={e => setDivisionSection(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="wizard-employment" className="block text-xs font-semibold text-slate-700 mb-1">
                    Employment Category *
                  </label>
                  <select
                    id="wizard-employment"
                    value={employmentCategory}
                    onChange={e => setEmploymentCategory(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="Permanent">Permanent (Regular)</option>
                    <option value="Casual">Casual</option>
                    <option value="Contractual">Contractual (Co-terminus)</option>
                    <option value="Job Order">Job Order (Contract of Service)</option>
                    <option value="Barangay Official">Barangay Official</option>
                    <option value="Barangay Worker">Barangay Worker (BHW / BNS / BSPO)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="wizard-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Mobile Number *
                  </label>
                  <input
                    id="wizard-phone"
                    type="tel"
                    required
                    placeholder="+63 9XX XXX XXXX"
                    value={contactNumber}
                    onChange={e => setContactNumber(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="wizard-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    id="wizard-email"
                    type="email"
                    required
                    placeholder="nominee@tacloban.gov.ph"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="@lg:col-span-2">
                  <label htmlFor="wizard-barangay" className="block text-xs font-semibold text-slate-700 mb-1">
                    Barangay Jurisdiction (Tacloban City)
                  </label>
                  <input
                    id="wizard-barangay"
                    type="text"
                    placeholder="e.g. Brgy. 88 San Jose"
                    value={barangay}
                    onChange={e => setBarangay(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </fieldset>
        )}

        {/* STEP 2: JUSTIFICATION & ACCOMPLISHMENTS */}
        {step === 2 && (
          <fieldset disabled={hasServerDraft || isSubmitting || savingRevision || detailsLocked} className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              <span>Nomination Justification & Merits</span>
            </h3>

            <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <div>
                <label htmlFor="wizard-nomination-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomination Type
                </label>
                <select
                  id="wizard-nomination-type"
                  value={nominationType}
                  onChange={e => setNominationType(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="Individual">Individual Category</option>
                  <option value="Group / Team">Group / Team Category</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="wizard-justification" className="block text-xs font-bold text-slate-800 mb-1">
                Executive Justification for Nomination * (Why does this nominee deserve this award?)
              </label>
              <textarea
                id="wizard-justification"
                required
                rows={3}
                placeholder="State the reasons, devotion, and sustained excellence demonstrated by the nominee..."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="wizard-accomplishments" className="block text-xs font-bold text-slate-800 mb-1">
                Key Accomplishments & Concrete Impact to Tacloban City Operations *
              </label>
              <textarea
                id="wizard-accomplishments"
                required
                rows={3}
                placeholder="Cite specific targets exceeded, innovative systems introduced, or community outcomes achieved..."
                value={accomplishments}
                onChange={e => setAccomplishments(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="wizard-supporting-narrative" className="block text-xs font-bold text-slate-800 mb-1">
                Supporting Narrative / Special Acts of Heroism or Integrity *
              </label>
              <textarea
                id="wizard-supporting-narrative"
                required
                rows={3}
                placeholder="Describe any extraordinary honesty, customer service commendations, or disaster responses..."
                value={supportingNarrative}
                onChange={e => setSupportingNarrative(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </fieldset>
        )}

        {/* STEP 3: DOCUMENTARY REQUIREMENTS */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck size={16} className="text-blue-600" />
                <span>Upload Required Documentary Attachments</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                The PRAISE Secretariat requires authenticated proof for every mandatory checklist item.
              </p>
            </div>

            {revisionApplication && revisionDraft ? <RevisionAttachmentList application={revisionApplication} award={selectedAward} draft={revisionDraft} disabled={savingRevision || isSubmitting} onUpload={(id, file) => void changeRevisionAttachment(id, file)} onRemove={id => void changeRevisionAttachment(id)} /> : <div className="space-y-3">
              {uploadedDocs.map((doc, idx) => (
                <div
                  key={doc.requirement_id || idx}
                  className="p-3 @lg:p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col @lg:flex-row @lg:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">{doc.requirement_name}</p>
                      {doc.is_mandatory && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Mandatory
                        </span>
                      )}
                    </div>
                    {doc.is_uploaded ? (
                      <p className="text-[11px] text-green-700 font-semibold mt-1 flex items-center gap-1">
                        <CheckCircle2 size={13} className="shrink-0" />
                        <span>{doc.file?.name || 'File attached'} ({((doc.file_size || 0) / 1024 / 1024).toFixed(2)} MB)</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-1">Accepted formats: PDF, DOCX, JPG, JPEG, PNG. Maximum file size: 10 MB.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {doc.file && ['application/pdf', 'image/jpeg', 'image/png'].includes(doc.file.type) && <LocalAttachmentPreview file={doc.file} />}
                    <label className="px-3.5 py-1.5 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2">
                      <Upload size={13} />
                      <span>{doc.is_uploaded ? 'Replace File' : 'Upload File'}</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png"
                        disabled={isSubmitting}
                        onChange={(e) => handleFileUpload(doc.requirement_id || '', doc.requirement_name, e)}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* STEP 4: REVIEW & CONFIRM */}
        {step === 4 && (
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              <span>Review Nomination Summary Before Official Submission</span>
            </h3>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 gap-4 text-xs @lg:grid-cols-2">
                <div>
                  <span className="text-slate-500">Nominee Name:</span>
                  <p className="font-bold text-slate-900 text-sm">{nomineeName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Award Category:</span>
                  <p className="font-bold text-blue-600">{selectedAward?.name}</p>
                </div>
                <div>
                  <span className="text-slate-500">Office / Barangay:</span>
                  <p className="font-semibold text-slate-800">{selectedOfficeObj?.name || revisionApplication?.office_name} • {barangay}</p>
                </div>
                <div>
                  <span className="text-slate-500">Position / Category:</span>
                  <p className="font-semibold text-slate-800">{positionTitle} ({employmentCategory})</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500 font-semibold">Justification Excerpt:</span>
                <p className="mt-1 max-h-28 overflow-y-auto break-words whitespace-pre-wrap rounded-lg bg-white p-3 italic leading-relaxed text-slate-700">
                  "{justification}"
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500 font-semibold">Attached Supporting Files:</span>
                <p className="text-slate-800 mt-1 font-medium">
                  {revision ? 'Review the attachment versions below before signing.' : `${uploadedDocs.filter(d => d.is_uploaded).length} of ${uploadedDocs.length} documentary requirements ready.`}
                </p>
              </div>
            </div>

            {revisionApplication && revisionDraft && <>
              <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 text-sm @lg:grid-cols-2 @lg:p-4">
                {Object.entries(revisionDetails).filter(([key]) => !['award_id', 'office_id', 'nominating_office_id'].includes(key)).map(([key, value]) => <div key={key}><dt className="font-semibold capitalize">{key.replaceAll('_', ' ')}</dt><dd className="whitespace-pre-wrap break-words">{value || 'Not recorded'}</dd></div>)}
              </dl>
              <RevisionAttachmentList application={revisionApplication} award={selectedAward} draft={revisionDraft} disabled />
              <label className="block text-sm font-semibold">Resubmission remarks
                <textarea rows={3} value={revisionRemarks} onChange={event => setRevisionRemarks(event.target.value)} disabled={isSubmitting} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
              </label>
            </>}
            <div className="rounded-xl border border-slate-200 p-4 text-xs space-y-2">
              <h3 className="text-sm font-bold">Nominator and electronic signature</h3>
              <p>{nominatorName} / {nominatorPosition} / {legacyDraft ? nominatingOffice : offices.find(office => office.id === nominatingOfficeId)?.name}</p>
              <p>Classification: {originLabel}</p>
              <p>Account used: {currentUser.full_name} ({currentUser.role})</p>
              <SignaturePad value={signatureStrokes} disabled={isSubmitting} onChange={strokes => { setSignatureStrokes(strokes); setSignatureConfirmed(false); setErrorMessage(''); }} />
              <label className="flex items-start gap-2 leading-5"><input type="checkbox" checked={signatureConfirmed} disabled={isSubmitting} onChange={event => { setSignatureConfirmed(event.target.checked); setErrorMessage(''); }} />I hereby confirm that the signature provided is my own and has been affixed with my full knowledge and consent.</label>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
              <p className="font-bold">Affirmation of Truthfulness:</p>
              <p className="mt-1">
                By submitting this form, you certify under oath that all statements and attachments are authentic, accurate, and compliant with the City Government of Tacloban PRAISE Guidelines.
              </p>
            </div>
          </div>
        )}

        {/* Wizard Controls Navigation */}
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 [&>button]:min-h-11 [&>button]:justify-center @lg:flex-row @lg:flex-wrap @lg:items-center @lg:justify-between">
          {step > 1 ? (
            <button
              id="wizard-prev-btn"
              type="button"
              onClick={() => { setStep((step - 1) as 1 | 2 | 3); setSignatureStrokes([]); setSignatureConfirmed(false); }}
              disabled={isSubmitting || savingRevision}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revision ? 'Save & Close' : hasServerDraft ? 'Close (draft saved)' : 'Cancel'}
            </button>
          )}

          {revision && step > 1 && <button type="button" onClick={() => void handleCancel()} disabled={savingRevision || isSubmitting} className="px-3 py-2 text-xs font-semibold text-slate-700">Save & Close</button>}
          {step < 4 ? (
            <button
              id="wizard-next-btn"
              type="button"
              onClick={() => void handleNext()}
              disabled={isSubmitting || savingRevision}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Continue</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              id="wizard-submit-btn"
              type="button"
              onClick={handleSubmitNomination}
              disabled={isSubmitting || isRestoringFiles || savingRevision}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles size={16} />
              <span>{isSubmitting ? 'Submitting...' : isRestoringFiles ? 'Restoring attachments...' : revision ? 'Submit Revised Nomination' : 'Officially Submit Nomination'}</span>
            </button>
          )}
        </div>
        {isRevisionDirty && errorMessage && !savingRevision && !isSubmitting && <div className="mt-3 space-y-2 text-xs">
          {confirmDiscard ? <>
            <p>Unsaved edits on this screen will be discarded. Your last saved draft will remain available.</p>
            <button type="button" className="rounded-md border border-red-200 px-3 py-2 font-semibold text-red-700" onClick={onCancel}>Discard Unsaved Edits and Close</button>
          </> : <button type="button" className="font-semibold text-slate-700 underline" onClick={() => setConfirmDiscard(true)}>Close without saving</button>}
        </div>}
        {savingRevision && <p role="status" className="mt-3 text-xs text-blue-700">Saving revision draft...</p>}
        {isSubmitting && <p className="mt-3 text-right text-xs font-semibold text-blue-700" role="status">{uploadProgress || (revision ? 'Submitting signed revision...' : 'Creating nomination draft...')}</p>}
      </div>
    </div>
  );
};
