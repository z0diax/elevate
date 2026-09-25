import React, { useRef, useState } from 'react';
import { Application, Award, Office, UserProfile } from '../../types';
import { praiseService } from '../../lib/supabase';
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
  Download
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { pdfGenerator } from '../../lib/pdfGenerator';
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
  onSubmissionStateChange?: (isSubmitting: boolean) => void;
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

export const NominationWizard: React.FC<NominationWizardProps> = ({
  awards,
  offices,
  currentUser,
  onNominationComplete,
  onCancel,
  onSubmissionStateChange,
}) => {
  const restoredDraft = React.useMemo(() => readNominationDraft(currentUser.id), [currentUser.id]);
  const [submissionId] = useState(() => restoredDraft?.submissionId || createSubmissionId());
  const restoredAwardId = restoredDraft && awards.some(award => award.id === restoredDraft.selectedAwardId)
    ? restoredDraft.selectedAwardId
    : awards[0]?.id || '';
  const restoredOfficeId = restoredDraft && offices.some(office => office.id === restoredDraft.officeId)
    ? restoredDraft.officeId
    : currentUser.office_id || offices[0]?.id || '';

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
  const [justification, setJustification] = useState(restoredDraft?.justification || '');
  const [accomplishments, setAccomplishments] = useState(restoredDraft?.accomplishments || '');
  const [supportingNarrative, setSupportingNarrative] = useState(restoredDraft?.supportingNarrative || '');

  // Uploaded Documents
  const [uploadedDocs, setUploadedDocs] = useState<UploadedRequirement[]>([]);

  const [submittedApp, setSubmittedApp] = useState<Application | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringFiles, setIsRestoringFiles] = useState(true);
  const [uploadProgress, setUploadProgress] = useState('');
  const submissionInProgress = useRef(false);
  const createdApplicationRef = useRef<Application | null>(null);
  const uploadedDocumentKeys = useRef(new Set<string>());

  const selectedAward = awards.find(a => a.id === selectedAwardId) || awards[0];
  const selectedOfficeObj = offices.find(o => o.id === officeId) || offices[0];
  const hasServerDraft = Boolean(createdApplicationRef.current)
    || praiseService.getApplications().some(application => application.id === `app-${submissionId}` && application.status === 'Draft');

  React.useEffect(() => {
    if (submittedApp) return;

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
    nominatorName,
    nominatorPosition,
    officeId,
    positionTitle,
    selectedAwardId,
    step,
    submissionId,
    submittedApp,
    supportingNarrative,
  ]);

  // Update document requirements when award changes
  React.useEffect(() => {
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
  }, [currentUser.id, selectedAwardId, selectedAward?.document_requirements]);

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

  const handleCancel = async () => {
    if (submissionInProgress.current) return;
    if (!hasServerDraft) await clearSavedDraft();
    onCancel();
  };

  // Validation
  const validateStep1 = () => {
    if (!selectedAwardId) return 'Please select an award category.';
    if (!nomineeName.trim()) return 'Nominee full name is required.';
    if (!positionTitle.trim()) return 'Position / Designation is required.';
    if (!contactNumber.trim()) return 'Contact number is required.';
    if (!email.trim()) return 'Email address is required.';
    return '';
  };

  const validateStep2 = () => {
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
    const mandatoryReqs = uploadedDocs.filter(doc => doc.is_mandatory);
    for (const req of mandatoryReqs) {
      if (!req.is_uploaded || !req.file || req.file.size === 0) {
        return `Mandatory Document Missing: "${req.requirement_name}". Please attach all required files.`;
      }
    }
    return '';
  };

  const handleNext = () => {
    setErrorMessage('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setErrorMessage(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2();
      if (err) { setErrorMessage(err); return; }
      setStep(3);
    } else if (step === 3) {
      const err = validateStep3();
      if (err) { setErrorMessage(err); return; }
      setStep(4);
    }
  };

  const handleSubmitNomination = async () => {
    if (submissionInProgress.current) return;
    const attachmentError = validateStep3();
    if (attachmentError) {
      setStep(3);
      setErrorMessage(attachmentError);
      return;
    }
    submissionInProgress.current = true;
    setErrorMessage('');
    setIsSubmitting(true);
    onSubmissionStateChange?.(true);

    try {
      const createdApplication = createdApplicationRef.current || await praiseService.submitNomination({
        submission_id: submissionId,
        award_id: selectedAwardId,
        nominee_id: currentUser.role === 'NOMINEE' ? currentUser.id : undefined,
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
        nominator_id: currentUser.id,
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
        selectedDocuments.map(document => document.requirement_id || document.requirement_name)
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
      onSubmissionStateChange?.(false);
    }
  };

  // If submitted successfully
  if (submittedApp) {
    return (
      <div id="nomination-success-card" className="max-w-3xl mx-auto bg-white rounded-xl p-8 border border-slate-200 shadow-xs text-center space-y-6">
        <div className="w-16 h-16 bg-green-50 text-green-700 rounded-full flex items-center justify-center mx-auto ring-8 ring-green-50">
          <Sparkles size={32} />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900">Nomination Successfully Filed!</h2>
          <p className="text-sm text-slate-500 mt-1">
            Your nomination has been recorded in the City of Tacloban PRAISE System.
          </p>
        </div>

        <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-left max-w-lg mx-auto space-y-3">
          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
            <span className="text-xs font-semibold text-slate-500">Official Reference No.</span>
            <span className="text-sm font-bold text-blue-700 font-mono">
              {submittedApp.application_number}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Nominee Name:</span>
            <span className="text-xs font-bold text-slate-900">{submittedApp.nominee_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Award Category:</span>
            <span className="text-xs font-bold text-slate-900">{submittedApp.award_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">Next Action:</span>
            <span className="text-xs font-medium text-amber-700">{submittedApp.required_action}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <button
            id="download-summary-dossier-btn"
            onClick={() => pdfGenerator.generateApplicationSummary(submittedApp, selectedAward, selectedOfficeObj)}
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
    <div id="nomination-wizard-container" className="max-w-4xl mx-auto bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Wizard Header */}
      <div className="px-6 py-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Official Form A-1</span>
          <h2 className="text-lg font-bold text-white">Tacloban PRAISE Nomination Portal</h2>
          <p className="text-xs text-slate-300 mt-0.5">Step {step} of 4: {
            step === 1 ? 'Nominee Profile & Award' :
            step === 2 ? 'Justification & Accomplishments' :
            step === 3 ? 'Documentary Requirements' : 'Review & Confirm'
          }</p>
        </div>

        {/* Step Indicator Badges */}
        <div className="flex items-center gap-2">
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
      </div>

      {/* Error notification banner */}
      {errorMessage && (
        <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-700">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {restoredDraft && (
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <p className="font-bold">Your saved nomination draft was restored.</p>
            <p className="mt-0.5 text-blue-700">
              You can continue from Step {restoredDraft.step}. Changes and selected attachments are saved automatically in this browser.
            </p>
          </div>
        </div>
      )}

      <div className="p-6 md:p-8 space-y-6">
        {/* STEP 1: NOMINEE PROFILE & AWARD SELECTION */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label htmlFor="award-category-select" className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                1. Select Award Category *
              </label>
              <div className="rounded-xl border border-slate-300 bg-slate-50 transition-colors focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                <div className="flex items-center gap-3 px-3.5">
                  <AwardIcon size={17} className="shrink-0 text-blue-600" />
                  <select
                    id="award-category-select"
                    required
                    value={selectedAwardId}
                    onChange={event => setSelectedAwardId(event.target.value)}
                    className="min-w-0 flex-1 cursor-pointer bg-transparent py-3 text-sm font-semibold text-slate-900 outline-none"
                  >
                    {awards.length === 0 && <option value="">No active awards available</option>}
                    {awards.map(award => (
                      <option key={award.id} value={award.id}>
                        {award.is_on_the_spot ? '[ON-THE-SPOT] ' : ''}{award.name} ({award.code})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAward?.description?.trim() && (
                  <div className="border-t border-slate-200 px-4 py-2 text-[11px] leading-relaxed text-slate-600">
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
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <h4 className="text-xs font-bold text-amber-900 mb-1.5 flex items-center gap-2">
                  <FileText size={14} className="shrink-0" />
                  <span>Award Notes</span>
                </h4>
                <p className="text-xs leading-relaxed text-amber-900 whitespace-pre-wrap">
                  {selectedAward.remarks}
                </p>
              </div>
            )}

            {/* Nominee Details Form */}
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <User size={16} className="text-blue-600" />
                <span>Nominee Information</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name of Nominee *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Juan P. Dela Cruz"
                    value={nomineeName}
                    onChange={e => setNomineeName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Employee / Personnel ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TAC-2024-001 or N/A"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Position / Designation *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Administrative Officer IV / BHW"
                    value={positionTitle}
                    onChange={e => setPositionTitle(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department / Office *
                  </label>
                  <select
                    value={officeId}
                    onChange={e => setOfficeId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {offices.map(off => (
                      <option key={off.id} value={off.id}>{off.name} ({off.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Division / Section
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Primary Health Services Unit"
                    value={divisionSection}
                    onChange={e => setDivisionSection(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Employment Category *
                  </label>
                  <select
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+63 9XX XXX XXXX"
                    value={contactNumber}
                    onChange={e => setContactNumber(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nominee@tacloban.gov.ph"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Barangay Jurisdiction (Tacloban City)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Brgy. 88 San Jose"
                    value={barangay}
                    onChange={e => setBarangay(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: JUSTIFICATION & ACCOMPLISHMENTS */}
        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              <span>Nomination Justification & Merits</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomination Type
                </label>
                <select
                  value={nominationType}
                  onChange={e => setNominationType(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="Individual">Individual Category</option>
                  <option value="Group / Team">Group / Team Category</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominator Name
                </label>
                <input
                  type="text"
                  value={nominatorName}
                  onChange={e => setNominatorName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Executive Justification for Nomination * (Why does this nominee deserve this award?)
              </label>
              <textarea
                required
                rows={3}
                placeholder="State the reasons, devotion, and sustained excellence demonstrated by the nominee..."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Key Accomplishments & Concrete Impact to Tacloban City Operations *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Cite specific targets exceeded, innovative systems introduced, or community outcomes achieved..."
                value={accomplishments}
                onChange={e => setAccomplishments(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Supporting Narrative / Special Acts of Heroism or Integrity *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe any extraordinary honesty, customer service commendations, or disaster responses..."
                value={supportingNarrative}
                onChange={e => setSupportingNarrative(e.target.value)}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
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

            <div className="space-y-3">
              {uploadedDocs.map((doc, idx) => (
                <div
                  key={doc.requirement_id || idx}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">{doc.requirement_name}</p>
                      {doc.is_mandatory && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Mandatory
                        </span>
                      )}
                    </div>
                    {doc.is_uploaded ? (
                      <p className="text-[11px] text-green-700 font-semibold mt-1 flex items-center gap-1">
                        <CheckCircle2 size={13} />
                        <span>{doc.file?.name || 'File attached'} ({((doc.file_size || 0) / 1024 / 1024).toFixed(2)} MB)</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-1">Accepted formats: PDF, DOCX, JPG, JPEG, PNG. Maximum file size: 10 MB.</p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <label className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors">
                      <Upload size={13} />
                      <span>{doc.is_uploaded ? 'Replace File' : 'Upload File'}</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png"
                        disabled={isSubmitting}
                        onChange={(e) => handleFileUpload(doc.requirement_id || '', doc.requirement_name, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
                  <p className="font-semibold text-slate-800">{selectedOfficeObj?.name} • {barangay}</p>
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
                  {uploadedDocs.filter(d => d.is_uploaded).length} of {uploadedDocs.length} documentary requirements ready.
                </p>
              </div>
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
        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          {step > 1 ? (
            <button
              id="wizard-prev-btn"
              type="button"
              onClick={() => setStep((step - 1) as any)}
              disabled={isSubmitting}
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
              {hasServerDraft ? 'Close (draft saved)' : 'Cancel'}
            </button>
          )}

          {step < 4 ? (
            <button
              id="wizard-next-btn"
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
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
              disabled={isSubmitting || isRestoringFiles}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles size={16} />
              <span>{isSubmitting ? 'Submitting...' : isRestoringFiles ? 'Restoring attachments...' : 'Officially Submit Nomination'}</span>
            </button>
          )}
        </div>
        {isSubmitting && <p className="mt-3 text-right text-xs font-semibold text-blue-700" role="status">{uploadProgress || 'Creating nomination draft...'}</p>}
      </div>
    </div>
  );
};
