import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS,
  normalizeCertificateTemplateSettings,
} from '../../lib/certificateTemplate';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { praiseService } from '../../lib/supabase';
import { Application, Award, CertificateTemplateSettings } from '../../types';
import {
  ArrowLeft,
  CheckCircle2,
  FileSignature,
  ImagePlus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  Users,
} from 'lucide-react';

interface CertificateTemplateViewProps {
  applications: Application[];
  awards: Award[];
  certificateTemplateSettings: CertificateTemplateSettings;
  onSaveCertificateTemplate: (settings: Omit<CertificateTemplateSettings, 'updated_at'>) => Promise<void>;
  onNavigateBack: () => void;
}

type EditableCertificateTemplate = Omit<CertificateTemplateSettings, 'updated_at'>;
type TokenTargetField = 'citation_text' | 'conferment_text';
type WorkspaceTab = 'content' | 'design' | 'signatories';

const TEMPLATE_TOKENS = [
  '{nominee_name}',
  '{position_title}',
  '{office_name}',
  '{award_name}',
  '{award_date}',
  '{award_year}',
  '{application_number}',
  '{weighted_score}',
  '{nominator_name}',
  '{nominator_position}',
];

const WORKSPACE_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'content', label: 'Wording', icon: Type },
  { id: 'design', label: 'Background', icon: ImagePlus },
  { id: 'signatories', label: 'Signatories', icon: Users },
];

const CERTIFICATE_SIGNERS = [
  { position: 'Left', nameKey: 'left_signatory_name', titleKey: 'left_signatory_title' },
  { position: 'Center', nameKey: 'center_signatory_name', titleKey: 'center_signatory_title' },
  { position: 'Right', nameKey: 'right_signatory_name', titleKey: 'right_signatory_title' },
] as const;

const FORM_A1_SIGNERS = [
  { position: 'Prepared by', labelKey: 'form_a1_prepared_label', nameKey: 'form_a1_prepared_name', titleKey: 'form_a1_prepared_title' },
  { position: 'Verified by', labelKey: 'form_a1_verified_label', nameKey: 'form_a1_verified_name', titleKey: 'form_a1_verified_title' },
  { position: 'Confirmed by', labelKey: 'form_a1_confirmed_label', nameKey: 'form_a1_confirmed_name', titleKey: 'form_a1_confirmed_title' },
] as const;

const SAMPLE_PREVIEW_APPLICATION: Application = {
  id: 'certificate-preview-sample',
  application_number: 'SAMPLE-PREVIEW',
  award_id: '',
  award_name: 'Service Excellence Award',
  award_year: new Date().getFullYear(),
  nominee_name: 'Sample Recipient',
  position_title: 'Public Service Employee',
  office_id: '',
  office_name: 'City Government of Tacloban',
  employment_category: 'Permanent',
  contact_number: '',
  email: '',
  nomination_type: 'Individual',
  nominator_id: '',
  nominator_name: 'Sample Nominator',
  nominator_position: 'Nominating Officer',
  nominating_office: 'City Government of Tacloban',
  justification: '',
  accomplishments: '',
  supporting_narrative: '',
  date_of_nomination: new Date().toISOString().slice(0, 10),
  status: 'Awarded',
  processing_stage: 'Awarded',
  final_weighted_score: 95,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function toEditableTemplate(settings: CertificateTemplateSettings): EditableCertificateTemplate {
  return {
    citation_text: settings.citation_text,
    conferment_text: settings.conferment_text,
    left_signatory_name: settings.left_signatory_name,
    left_signatory_title: settings.left_signatory_title,
    center_signatory_name: settings.center_signatory_name,
    center_signatory_title: settings.center_signatory_title,
    right_signatory_name: settings.right_signatory_name,
    right_signatory_title: settings.right_signatory_title,
    form_a1_prepared_label: settings.form_a1_prepared_label,
    form_a1_prepared_name: settings.form_a1_prepared_name,
    form_a1_prepared_title: settings.form_a1_prepared_title,
    form_a1_verified_label: settings.form_a1_verified_label,
    form_a1_verified_name: settings.form_a1_verified_name,
    form_a1_verified_title: settings.form_a1_verified_title,
    form_a1_confirmed_label: settings.form_a1_confirmed_label,
    form_a1_confirmed_name: settings.form_a1_confirmed_name,
    form_a1_confirmed_title: settings.form_a1_confirmed_title,
    background_image_url: settings.background_image_url || '',
  };
}

const defaultEditableTemplate = toEditableTemplate(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
const requiredTemplateFields: Array<Exclude<keyof EditableCertificateTemplate, 'background_image_url'>> = [
  'citation_text',
  'conferment_text',
  'left_signatory_name',
  'left_signatory_title',
  'center_signatory_name',
  'center_signatory_title',
  'right_signatory_name',
  'right_signatory_title',
  'form_a1_prepared_label',
  'form_a1_prepared_name',
  'form_a1_prepared_title',
  'form_a1_verified_label',
  'form_a1_verified_name',
  'form_a1_verified_title',
  'form_a1_confirmed_label',
  'form_a1_confirmed_name',
  'form_a1_confirmed_title',
];

export const CertificateTemplateView: React.FC<CertificateTemplateViewProps> = ({
  applications,
  awards,
  certificateTemplateSettings,
  onSaveCertificateTemplate,
  onNavigateBack,
}) => {
  const [templateForm, setTemplateForm] = useState<EditableCertificateTemplate>(() => toEditableTemplate(certificateTemplateSettings));
  const [activeTokenField, setActiveTokenField] = useState<TokenTargetField>('citation_text');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('content');
  const [selectedPreviewApplicationId, setSelectedPreviewApplicationId] = useState<string>('');
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string>(certificateTemplateSettings.background_image_url || '');
  const [pendingBackgroundFile, setPendingBackgroundFile] = useState<File | null>(null);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [previewPdfUrl, setPreviewPdfUrl] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState('');
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);

  const savedTemplate = useMemo(
    () => toEditableTemplate(certificateTemplateSettings),
    [certificateTemplateSettings]
  );

  useEffect(() => {
    setTemplateForm(savedTemplate);
    setBackgroundPreviewUrl(savedTemplate.background_image_url || '');
    setPendingBackgroundFile(null);
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = '';
    }
  }, [savedTemplate]);

  useEffect(() => (
    () => {
      if (backgroundPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(backgroundPreviewUrl);
      }
    }
  ), [backgroundPreviewUrl]);

  const latestAwardedApp = applications.find(application => application.status === 'Awarded') || applications[0];

  useEffect(() => {
    if (!applications.length) {
      setSelectedPreviewApplicationId('');
      return;
    }

    if (!selectedPreviewApplicationId || !applications.some(application => application.id === selectedPreviewApplicationId)) {
      setSelectedPreviewApplicationId(latestAwardedApp?.id || applications[0].id);
    }
  }, [applications, latestAwardedApp, selectedPreviewApplicationId]);

  const previewApplication = applications.find(application => application.id === selectedPreviewApplicationId)
    || latestAwardedApp
    || SAMPLE_PREVIEW_APPLICATION;
  const previewAward = useMemo(
    () => awards.find(award => award.id === previewApplication?.award_id),
    [awards, previewApplication]
  );
  const previewBackgroundImage = backgroundPreviewUrl || templateForm.background_image_url || '';
  const previewTemplateSettings = useMemo(
    () => normalizeCertificateTemplateSettings({
      ...templateForm,
      background_image_url: previewBackgroundImage,
    }),
    [previewBackgroundImage, templateForm]
  );

  const hasUnsavedTemplateChanges = (Object.keys(savedTemplate) as Array<keyof EditableCertificateTemplate>)
    .some(key => templateForm[key] !== savedTemplate[key]);
  const hasPendingBackgroundUpload = Boolean(pendingBackgroundFile);
  const isTemplateValid = requiredTemplateFields.every(field => templateForm[field].trim() !== '');
  const templateUpdatedLabel = certificateTemplateSettings.updated_at
    ? new Date(certificateTemplateSettings.updated_at).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Default template';
  useEffect(() => (
    () => {
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }
    }
  ), [previewPdfUrl]);

  useEffect(() => {
    let cancelled = false;

    if (!previewApplication) {
      setPreviewPdfUrl('');
      setPreviewLoadError('');
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
    setPreviewLoadError('');

    void (async () => {
      try {
        const previewBlob = await pdfGenerator.generateAwardCertificatePreviewBlob(
          previewApplication,
          previewAward,
          previewTemplateSettings
        );
        const nextPreviewUrl = URL.createObjectURL(previewBlob);

        if (cancelled) {
          URL.revokeObjectURL(nextPreviewUrl);
          return;
        }

        setPreviewPdfUrl(nextPreviewUrl);
      } catch (error) {
        if (!cancelled) {
          setPreviewPdfUrl('');
          setPreviewLoadError(error instanceof Error ? error.message : 'Unable to render the certificate preview.');
        }
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewApplication, previewAward, previewTemplateSettings]);

  const handleTemplateFieldChange = (field: keyof EditableCertificateTemplate, value: string) => {
    setTemplateForm(current => ({
      ...current,
      [field]: value,
    }));
    setTemplateNotice('');
    setTemplateError('');
  };

  const handleInsertToken = (token: string) => {
    setTemplateForm(current => ({
      ...current,
      [activeTokenField]: `${current[activeTokenField]} ${token}`.trim(),
    }));
    setTemplateNotice('');
    setTemplateError('');
  };

  const handleSelectBackgroundFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type.startsWith('image/')) {
      setTemplateError('Select a JPG, PNG, or WEBP image for the certificate background.');
      setTemplateNotice('');
      return;
    }

    setPendingBackgroundFile(selectedFile);
    setBackgroundPreviewUrl(URL.createObjectURL(selectedFile));
    setTemplateNotice('Background image selected. Upload it, then save the certificate template to publish the new design.');
    setTemplateError('');
  };

  const handleUploadBackground = async () => {
    if (!pendingBackgroundFile) {
      setTemplateError('Select a certificate background image first.');
      setTemplateNotice('');
      return;
    }

    setIsUploadingBackground(true);
    setTemplateNotice('');
    setTemplateError('');

    try {
      const uploadedBackgroundUrl = await praiseService.uploadCertificateTemplateBackground(pendingBackgroundFile);
      setTemplateForm(current => ({
        ...current,
        background_image_url: uploadedBackgroundUrl,
      }));
      setBackgroundPreviewUrl(uploadedBackgroundUrl);
      setPendingBackgroundFile(null);
      if (backgroundFileInputRef.current) {
        backgroundFileInputRef.current.value = '';
      }
      setTemplateNotice('Background image uploaded. Save the certificate template to make the new design live across the app.');
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Failed to upload the certificate background image.');
    } finally {
      setIsUploadingBackground(false);
    }
  };

  const handleRemoveBackground = () => {
    setPendingBackgroundFile(null);
    setBackgroundPreviewUrl('');
    setTemplateForm(current => ({
      ...current,
      background_image_url: '',
    }));
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = '';
    }
    setTemplateNotice('Certificate background removed. Save the certificate template to return to the default clean layout.');
    setTemplateError('');
  };

  const resetEditorToSaved = () => {
    setTemplateForm(savedTemplate);
    setBackgroundPreviewUrl(savedTemplate.background_image_url || '');
    setPendingBackgroundFile(null);
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = '';
    }
    setTemplateNotice('');
    setTemplateError('');
  };

  const restoreTemplateDefaults = () => {
    setTemplateForm(defaultEditableTemplate);
    setBackgroundPreviewUrl(defaultEditableTemplate.background_image_url || '');
    setPendingBackgroundFile(null);
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = '';
    }
    setTemplateNotice('');
    setTemplateError('');
  };

  const handleSaveTemplate = async () => {
    if (!isTemplateValid) {
      setTemplateError('Complete all certificate message and signatory fields before saving.');
      setTemplateNotice('');
      return;
    }

    if (hasPendingBackgroundUpload) {
      setTemplateError('Upload the selected certificate background image before saving the template.');
      setTemplateNotice('');
      return;
    }

    setIsSavingTemplate(true);
    setTemplateNotice('');
    setTemplateError('');

    try {
      await onSaveCertificateTemplate(templateForm);
      setTemplateNotice('Certificate template saved. New PDFs will use the updated wording, signatories, and background design.');
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Failed to save certificate template.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <div id="certificate-template-view-container" className="space-y-5 pb-8">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onNavigateBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-700"
            >
              <ArrowLeft size={14} />
              Back to Reports
            </button>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <FileSignature size={19} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-blue-700">Reports & certificates</p>
                <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Certificate editor</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Set the wording, artwork, and signatories used by new certificate PDFs. Form A-1 and the deliberation matrix use the signatories configured here too.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              hasPendingBackgroundUpload
                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                : hasUnsavedTemplateChanges
                  ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200'
                  : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
            }`}>
              {!hasPendingBackgroundUpload && !hasUnsavedTemplateChanges && <CheckCircle2 size={13} />}
              {hasPendingBackgroundUpload ? 'Upload image to continue' : hasUnsavedTemplateChanges ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <p className="text-[11px] text-slate-500">Last saved: {templateUpdatedLabel}</p>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isSavingTemplate || isUploadingBackground || hasPendingBackgroundUpload || !hasUnsavedTemplateChanges || !isTemplateValid}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={15} />
              {isSavingTemplate ? 'Saving...' : 'Save template'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Edit actions</span>
          <button
            type="button"
            onClick={resetEditorToSaved}
            disabled={!hasUnsavedTemplateChanges && !hasPendingBackgroundUpload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={13} />
            Discard edits
          </button>
          <button
            type="button"
            onClick={restoreTemplateDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={13} />
            Use default settings
          </button>
          <span className="text-xs text-slate-500">Default settings appear in the preview until you save them.</span>
        </div>
      </header>

      {(templateNotice || templateError) && (
        <div
          role={templateError ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            templateError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {templateError || templateNotice}
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,1fr)] xl:items-start">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Template settings">
          <div className="border-b border-slate-200 px-5 pt-5 sm:px-6">
            <h2 className="text-base font-bold text-slate-900">Template settings</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Choose a section, make your changes, and check the PDF preview alongside it.</p>
            <div className="mt-5 flex gap-1 overflow-x-auto" role="tablist" aria-label="Certificate settings">
              {WORKSPACE_TABS.map(tab => {
                const Icon = tab.icon;
                const selected = activeWorkspaceTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`certificate-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="certificate-editor-panel"
                    onClick={() => setActiveWorkspaceTab(tab.id)}
                    className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${
                      selected ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div id="certificate-editor-panel" role="tabpanel" aria-labelledby={`certificate-tab-${activeWorkspaceTab}`} tabIndex={0} className="min-h-[520px] space-y-5 p-5 sm:p-6">
            {activeWorkspaceTab === 'content' && (
              <>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Certificate message</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Write the recognition paragraph and the closing line. Placeholders insert details from the selected nomination.</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label htmlFor="certificate-citation" className="block text-sm font-bold text-slate-900">Recognition citation</label>
                  <p className="mt-1 text-xs text-slate-500">Appears beneath the recipient's name and office.</p>
                  <textarea
                    id="certificate-citation"
                    rows={5}
                    value={templateForm.citation_text}
                    onFocus={() => setActiveTokenField('citation_text')}
                    onChange={event => handleTemplateFieldChange('citation_text', event.target.value)}
                    className="mt-3 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label htmlFor="certificate-conferment" className="block text-sm font-bold text-slate-900">Conferment line</label>
                  <p className="mt-1 text-xs text-slate-500">Appears below the award title, before the signatories.</p>
                  <textarea
                    id="certificate-conferment"
                    rows={3}
                    value={templateForm.conferment_text}
                    onFocus={() => setActiveTokenField('conferment_text')}
                    onChange={event => handleTemplateFieldChange('conferment_text', event.target.value)}
                    className="mt-3 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Insert nomination detail</h4>
                      <p className="mt-1 text-xs text-slate-600">Choose the field that should receive a placeholder.</p>
                    </div>
                    <div className="inline-flex rounded-lg border border-blue-200 bg-white p-1 text-xs font-semibold">
                      <button type="button" onClick={() => setActiveTokenField('citation_text')} className={`rounded-md px-2.5 py-1.5 ${activeTokenField === 'citation_text' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Citation</button>
                      <button type="button" onClick={() => setActiveTokenField('conferment_text')} className={`rounded-md px-2.5 py-1.5 ${activeTokenField === 'conferment_text' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>Conferment</button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TEMPLATE_TOKENS.map(token => (
                      <button key={token} type="button" onClick={() => handleInsertToken(token)} className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-blue-800 hover:bg-blue-100">
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeWorkspaceTab === 'design' && (
              <>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Certificate appearance</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">The default certificate has a clean border. Add artwork only if the text remains easy to read.</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-slate-900">Background artwork</h4>
                  <p className="mt-1 text-xs text-slate-500">Use a landscape JPG, PNG, or WEBP image with open space for the recipient and signatures.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="flex aspect-[1.414/1] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {previewBackgroundImage
                        ? <img src={previewBackgroundImage} alt="Selected certificate background" className="h-full w-full object-cover" />
                        : <div className="text-center text-slate-400"><ImagePlus size={28} className="mx-auto" /><span className="mt-2 block text-xs">Default border</span></div>}
                    </div>
                    <div className="min-w-0 space-y-3">
                      <p className="break-words text-xs leading-5 text-slate-600">
                        {pendingBackgroundFile
                          ? `Selected: ${pendingBackgroundFile.name}. Upload this image before saving.`
                          : previewBackgroundImage
                            ? 'A custom background is selected. The live preview shows how it will appear.'
                            : 'No custom image is selected. The standard certificate design is active.'}
                      </p>
                      <input ref={backgroundFileInputRef} id="certificate-background-upload" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleSelectBackgroundFile} className="sr-only" />
                      <div className="flex flex-wrap gap-2">
                        <label htmlFor="certificate-background-upload" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <ImagePlus size={14} /> {pendingBackgroundFile ? 'Change image' : 'Choose image'}
                        </label>
                        <button type="button" onClick={handleUploadBackground} disabled={!pendingBackgroundFile || isUploadingBackground} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                          <Upload size={14} /> {isUploadingBackground ? 'Uploading...' : 'Upload image'}
                        </button>
                        <button type="button" onClick={handleRemoveBackground} disabled={!previewBackgroundImage && !pendingBackgroundFile} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  Background changes take two steps: upload the selected image, then save the template. The PDF preview reflects your current selection before either step is complete.
                </div>
              </>
            )}

            {activeWorkspaceTab === 'signatories' && (
              <>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Certificate signatories</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">These names and titles appear left to right on certificates and deliberation matrix PDFs.</p>
                </div>

                <div className="space-y-3">
                  {CERTIFICATE_SIGNERS.map((signer, index) => (
                    <div key={signer.position} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{index + 1}</span>
                        <h4 className="text-sm font-bold text-slate-900">{signer.position} signatory</h4>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor={signer.nameKey} className="block text-xs font-semibold text-slate-600">Full name</label>
                          <input id={signer.nameKey} type="text" value={templateForm[signer.nameKey]} onChange={event => handleTemplateFieldChange(signer.nameKey, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label htmlFor={signer.titleKey} className="block text-xs font-semibold text-slate-600">Position or title</label>
                          <input id={signer.titleKey} type="text" value={templateForm[signer.titleKey]} onChange={event => handleTemplateFieldChange(signer.titleKey, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-base font-bold text-slate-900">Form A-1 signatories</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">These fields appear in the nomination summary dossier. They can differ from the certificate signatories.</p>
                </div>
                <div className="space-y-3">
                  {FORM_A1_SIGNERS.map((signer, index) => (
                    <div key={signer.position} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700">{index + 1}</span>
                        <h4 className="text-sm font-bold text-slate-900">{signer.position}</h4>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor={signer.labelKey} className="block text-xs font-semibold text-slate-600">Heading on PDF</label>
                          <input id={signer.labelKey} type="text" value={templateForm[signer.labelKey]} onChange={event => handleTemplateFieldChange(signer.labelKey, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label htmlFor={signer.nameKey} className="block text-xs font-semibold text-slate-600">Full name</label>
                          <input id={signer.nameKey} type="text" value={templateForm[signer.nameKey]} onChange={event => handleTemplateFieldChange(signer.nameKey, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label htmlFor={signer.titleKey} className="block text-xs font-semibold text-slate-600">Position or title</label>
                          <input id={signer.titleKey} type="text" value={templateForm[signer.titleKey]} onChange={event => handleTemplateFieldChange(signer.titleKey, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                  Use <code className="rounded bg-white px-1 py-0.5">{'{nominator_name}'}</code> and <code className="rounded bg-white px-1 py-0.5">{'{nominator_position}'}</code> to fill in the nominator's details automatically.
                </p>
              </>
            )}

            {!isTemplateValid && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Complete every wording and signatory field before saving.</p>}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5 xl:sticky xl:top-5" aria-label="Certificate preview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-blue-700">Live PDF preview</p>
              <h2 className="mt-1 text-base font-bold text-slate-900">Review the certificate</h2>
              <p className="mt-1 text-xs text-slate-500">The preview reflects your current edits before you save.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">Landscape A4</span>
          </div>

          <div className="mt-4">
            <label htmlFor="certificate-preview-record" className="block text-xs font-bold text-slate-700">Preview with nomination</label>
            <select
              id="certificate-preview-record"
              value={selectedPreviewApplicationId}
              onChange={event => setSelectedPreviewApplicationId(event.target.value)}
              disabled={!applications.length}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {!applications.length && <option value="">Sample certificate (preview only)</option>}
              {applications.map(application => (
                <option key={application.id} value={application.id}>
                  {application.nominee_name} - {application.award_name || 'Tacloban PRAISE Award'}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
            <div className="relative aspect-[1.414/1] w-full overflow-hidden rounded-lg bg-white">
              {previewPdfUrl && !previewLoadError && (
                <iframe key={previewPdfUrl} title="Certificate PDF preview" src={`${previewPdfUrl}#toolbar=0&navpanes=0&scrollbar=0&zoom=page-fit&pagemode=none`} className="h-full w-full border-0 bg-white" />
              )}
              {isPreviewLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-4 text-center text-sm text-slate-600">Rendering certificate preview...</div>}
              {previewLoadError && !isPreviewLoading && <div className="absolute inset-0 flex items-center justify-center bg-white px-4 text-center text-sm text-red-700">{previewLoadError}</div>}
              {!previewPdfUrl && !isPreviewLoading && !previewLoadError && <div className="absolute inset-0 flex items-center justify-center bg-white px-4 text-center text-sm text-slate-500">Select a nomination to preview the certificate.</div>}
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {applications.length
              ? `Showing ${previewApplication.application_number} for ${previewApplication.nominee_name}.`
              : 'Showing sample recipient details until a nomination is available.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (!previewApplication) return;
              void pdfGenerator.generateAwardCertificate(previewApplication, previewAward, previewTemplateSettings);
            }}
            disabled={!previewApplication || isPreviewLoading || Boolean(previewLoadError)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={15} /> Download preview PDF
          </button>
          <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">Save the template to use these changes in future generated PDFs.</p>
        </section>
      </div>
    </div>
  );
};
