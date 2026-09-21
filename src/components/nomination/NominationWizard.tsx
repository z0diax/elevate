import React, { useState } from 'react';
import { Award, Office, UserProfile } from '../../types';
import { praiseService } from '../../lib/supabase';
import { TACLOBAN_BARANGAYS } from '../../lib/initialData';
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

interface NominationWizardProps {
  awards: Award[];
  offices: Office[];
  currentUser: UserProfile;
  onNominationComplete: (appId: string) => void;
  onCancel: () => void;
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

export const NominationWizard: React.FC<NominationWizardProps> = ({
  awards,
  offices,
  currentUser,
  onNominationComplete,
  onCancel
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [selectedAwardId, setSelectedAwardId] = useState(awards[0]?.id || '');
  
  // Nominee Info
  const [nomineeName, setNomineeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [officeId, setOfficeId] = useState(currentUser.office_id || offices[0]?.id || '');
  const [divisionSection, setDivisionSection] = useState('');
  const [employmentCategory, setEmploymentCategory] = useState<'Permanent' | 'Casual' | 'Contractual' | 'Job Order' | 'Barangay Official' | 'Barangay Worker'>('Permanent');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [barangay, setBarangay] = useState('Brgy. 88 San Jose');

  // Nomination Details
  const [nominationType, setNominationType] = useState<'Individual' | 'Group / Team'>('Individual');
  const [nominatorName, setNominatorName] = useState(currentUser.full_name);
  const [nominatorPosition, setNominatorPosition] = useState(currentUser.position_title || 'Nominator');
  const [nominatingOffice, setNominatingOffice] = useState(currentUser.office_name || 'City Government of Tacloban');
  const [justification, setJustification] = useState('');
  const [accomplishments, setAccomplishments] = useState('');
  const [supportingNarrative, setSupportingNarrative] = useState('');

  // Uploaded Documents
  const [uploadedDocs, setUploadedDocs] = useState<UploadedRequirement[]>([]);

  const [submittedApp, setSubmittedApp] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAward = awards.find(a => a.id === selectedAwardId) || awards[0];
  const selectedOfficeObj = offices.find(o => o.id === officeId) || offices[0];

  // Update document requirements when award changes
  React.useEffect(() => {
    if (selectedAward?.document_requirements) {
      setUploadedDocs(
        selectedAward.document_requirements.map(req => ({
          requirement_id: req.id,
          requirement_name: req.document_name,
          file_size: 0,
          file_type: 'application/pdf',
          is_mandatory: req.is_mandatory,
          is_uploaded: false
        }))
      );
    }
  }, [selectedAwardId, selectedAward]);

  const handleFileUpload = (reqId: string, docName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds 10MB limit. Please upload a compressed document.');
      return;
    }

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
    const mandatoryReqs = uploadedDocs.filter(doc => doc.is_mandatory);
    for (const req of mandatoryReqs) {
      if (!req.is_uploaded || !req.file) {
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
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const createdApplication = await praiseService.submitNomination({
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

      for (const document of uploadedDocs) {
        if (document.file) {
          await praiseService.uploadApplicationDocument(
            createdApplication.id,
            document.file,
            document.requirement_name,
            document.requirement_id
          );
        }
      }

      setSubmittedApp(praiseService.getApplicationById(createdApplication.id) || createdApplication);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred while submitting the nomination.');
    } finally {
      setIsSubmitting(false);
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
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download size={15} />
            <span>Download Summary Form A-1 (PDF)</span>
          </button>

          <button
            id="view-application-dashboard-btn"
            onClick={() => onNominationComplete(submittedApp.id)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
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

      <div className="p-6 md:p-8 space-y-6">
        {/* STEP 1: NOMINEE PROFILE & AWARD SELECTION */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                1. Select Award Category *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {awards.map(award => (
                  <button
                    key={award.id}
                    type="button"
                    onClick={() => setSelectedAwardId(award.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedAwardId === award.id
                        ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AwardIcon size={16} className={selectedAwardId === award.id ? 'text-blue-600' : 'text-slate-400'} />
                      <p className="text-xs font-bold text-slate-900 truncate">{award.name}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {award.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Award Eligibility Checklist */}
            {selectedAward?.eligibility_requirements && (
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
                  <select
                    value={barangay}
                    onChange={e => setBarangay(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {TACLOBAN_BARANGAYS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
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
                      <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, or Scanned Image (Max 10MB)</p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <label className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors">
                      <Upload size={13} />
                      <span>{doc.is_uploaded ? 'Replace File' : 'Upload File'}</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
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
                <p className="text-slate-700 mt-1 italic">"{justification}"</p>
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
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          )}

          {step < 4 ? (
            <button
              id="wizard-next-btn"
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              id="wizard-submit-btn"
              type="button"
              onClick={handleSubmitNomination}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles size={16} />
              <span>{isSubmitting ? 'Submitting...' : 'Officially Submit Nomination'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
