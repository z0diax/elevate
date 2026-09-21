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
  FileSignature,
  ImagePlus,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
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
];

const WORKSPACE_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'content', label: 'Message', icon: Type },
  { id: 'design', label: 'Design', icon: ImagePlus },
  { id: 'signatories', label: 'Signatories', icon: Users },
];

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
];

function RibbonGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

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
  const citationSectionRef = useRef<HTMLDivElement | null>(null);
  const confermentSectionRef = useRef<HTMLDivElement | null>(null);
  const signatoriesSectionRef = useRef<HTMLDivElement | null>(null);

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
    || applications[0];
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
  const activeFieldLabel = activeTokenField === 'citation_text' ? 'Citation' : 'Conferment';
  const templateUpdatedLabel = certificateTemplateSettings.updated_at
    ? new Date(certificateTemplateSettings.updated_at).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Default template';
  const previewCanvasStyle = {
    width: 'min(100%, calc((100vh - 19rem) * 1.4142857))',
  } as const;

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

  const scrollToEditorSection = (
    targetRef: React.RefObject<HTMLDivElement | null>,
    field?: TokenTargetField,
  ) => {
    if (field) {
      setActiveTokenField(field);
    }

    targetRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
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

  const renderRibbonPanel = () => {
    if (activeWorkspaceTab === 'content') {
      return (
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
          <RibbonGroup label="Insert Target">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => scrollToEditorSection(citationSectionRef, 'citation_text')}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  activeTokenField === 'citation_text'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Citation
              </button>
              <button
                type="button"
                onClick={() => scrollToEditorSection(confermentSectionRef, 'conferment_text')}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  activeTokenField === 'conferment_text'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Conferment
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Current target: <span className="font-semibold text-slate-800">{activeFieldLabel}</span>
            </p>
          </RibbonGroup>

          <RibbonGroup label="Message Tokens">
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_TOKENS.map(token => (
                <button
                  key={token}
                  type="button"
                  onClick={() => handleInsertToken(token)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100"
                >
                  {token}
                </button>
              ))}
            </div>
          </RibbonGroup>

          <RibbonGroup label="Preview Record">
            <select
              value={selectedPreviewApplicationId}
              onChange={event => setSelectedPreviewApplicationId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              {applications.map(application => (
                <option key={application.id} value={application.id}>
                  {application.nominee_name} - {application.award_name || 'Tacloban PRAISE Award'}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs text-slate-500">Last saved: <span className="font-medium text-slate-700">{templateUpdatedLabel}</span></p>
          </RibbonGroup>
        </div>
      );
    }

    if (activeWorkspaceTab === 'design') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <RibbonGroup label="Background Artwork">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="certificate-background-upload"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ImagePlus size={13} />
                <span>{pendingBackgroundFile ? 'Change Image' : 'Choose Image'}</span>
              </label>
              <input
                ref={backgroundFileInputRef}
                id="certificate-background-upload"
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleSelectBackgroundFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleUploadBackground}
                disabled={!pendingBackgroundFile || isUploadingBackground}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={13} />
                <span>{isUploadingBackground ? 'Uploading...' : 'Upload'}</span>
              </button>
              <button
                type="button"
                onClick={handleRemoveBackground}
                disabled={!previewBackgroundImage && !pendingBackgroundFile}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>Remove</span>
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Use a landscape certificate image with enough quiet space for the title, recipient, and signatures.
            </p>
          </RibbonGroup>

          <RibbonGroup label="Background Status">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {pendingBackgroundFile
                ? `Selected image: ${pendingBackgroundFile.name}. Upload it before saving the template.`
                : previewBackgroundImage
                  ? 'Custom certificate background is active in the preview and will be used in generated PDFs after saving.'
                  : 'No custom background image is set. The certificate is using the standard clean layout.'}
            </div>
          </RibbonGroup>
        </div>
      );
    }

    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {[
          {
            title: 'Left Signatory',
            name: templateForm.left_signatory_name,
            role: templateForm.left_signatory_title,
          },
          {
            title: 'Center Signatory',
            name: templateForm.center_signatory_name,
            role: templateForm.center_signatory_title,
          },
          {
            title: 'Right Signatory',
            name: templateForm.right_signatory_name,
            role: templateForm.right_signatory_title,
          },
        ].map(signatory => (
          <button
            key={signatory.title}
            type="button"
            onClick={() => scrollToEditorSection(signatoriesSectionRef)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-xs transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{signatory.title}</p>
            <p className="mt-3 text-sm font-semibold text-slate-900">{signatory.name}</p>
            <p className="mt-1 text-xs text-slate-500">{signatory.role}</p>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div id="certificate-template-view-container" className="space-y-6">
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                <Sparkles size={12} />
                <span>Certificate Template</span>
              </div>
              <h2 className="mt-3 text-2xl font-bold">Certificate Editor Workspace</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-300">
                Edit certificate content, background artwork, and signatories in a cleaner document-style workspace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onNavigateBack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                <ArrowLeft size={14} />
                <span>Back to Reports</span>
              </button>
              <button
                type="button"
                onClick={resetEditorToSaved}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={restoreTemplateDefaults}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                <RotateCcw size={14} />
                <span>Defaults</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!previewApplication) {
                    return;
                  }
                  void pdfGenerator.generateAwardCertificate(
                    previewApplication,
                    awards.find(award => award.id === previewApplication.award_id),
                    previewTemplateSettings
                  );
                }}
                disabled={!previewApplication}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer size={14} />
                <span>Preview PDF</span>
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate || isUploadingBackground || hasPendingBackgroundUpload || !hasUnsavedTemplateChanges || !isTemplateValid}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={14} />
                <span>{isSavingTemplate ? 'Saving...' : 'Save Template'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white">
          <div className="flex items-end gap-6 overflow-x-auto px-6 pt-4">
            {WORKSPACE_TABS.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeWorkspaceTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveWorkspaceTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-slate-900 text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <TabIcon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            {renderRibbonPanel()}
          </div>
        </div>

        {(templateNotice || templateError) && (
          <div className={`border-b px-6 py-3 text-sm ${
            templateError
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            {templateError || templateNotice}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-r-0 border-slate-200 bg-white xl:border-r">
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Type size={12} />
                <span>Editor</span>
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900">Certificate Content</h3>
              <p className="mt-1 text-sm text-slate-500">
                Keep the wording precise and formal. Use the section shortcuts below to jump to the active block.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => scrollToEditorSection(citationSectionRef, 'citation_text')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Citation
                </button>
                <button
                  type="button"
                  onClick={() => scrollToEditorSection(confermentSectionRef, 'conferment_text')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Conferment
                </button>
                <button
                  type="button"
                  onClick={() => scrollToEditorSection(signatoriesSectionRef)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Signatories
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div
                ref={citationSectionRef}
                className={`rounded-2xl border ${
                  activeTokenField === 'citation_text'
                    ? 'border-blue-300 bg-blue-50/30'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="border-b border-slate-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Message Block</p>
                      <h4 className="mt-2 text-base font-bold text-slate-900">Certificate Citation</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Main recognition paragraph shown before the award title.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTokenField('citation_text')}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        activeTokenField === 'citation_text'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Active
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <textarea
                    rows={10}
                    value={templateForm.citation_text}
                    onFocus={() => setActiveTokenField('citation_text')}
                    onChange={event => handleTemplateFieldChange('citation_text', event.target.value)}
                    className="min-h-[250px] w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-8 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div
                ref={confermentSectionRef}
                className={`rounded-2xl border ${
                  activeTokenField === 'conferment_text'
                    ? 'border-blue-300 bg-blue-50/30'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="border-b border-slate-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Closing Block</p>
                      <h4 className="mt-2 text-base font-bold text-slate-900">Conferment Line</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Closing statement shown below the award and above the reference details.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTokenField('conferment_text')}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        activeTokenField === 'conferment_text'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Active
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <textarea
                    rows={7}
                    value={templateForm.conferment_text}
                    onFocus={() => setActiveTokenField('conferment_text')}
                    onChange={event => handleTemplateFieldChange('conferment_text', event.target.value)}
                    className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-8 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div
                ref={signatoriesSectionRef}
                className="rounded-2xl border border-slate-200 bg-slate-50/50"
              >
                <div className="border-b border-slate-200 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signature Block</p>
                  <h4 className="mt-2 text-base font-bold text-slate-900">Certificate Signatories</h4>
                </div>

                <div className="space-y-4 p-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-bold uppercase tracking-wide text-slate-800">Left Signatory</h5>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Name</label>
                        <input
                          type="text"
                          value={templateForm.left_signatory_name}
                          onChange={event => handleTemplateFieldChange('left_signatory_name', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Title</label>
                        <input
                          type="text"
                          value={templateForm.left_signatory_title}
                          onChange={event => handleTemplateFieldChange('left_signatory_title', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-bold uppercase tracking-wide text-slate-800">Center Signatory</h5>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Name</label>
                        <input
                          type="text"
                          value={templateForm.center_signatory_name}
                          onChange={event => handleTemplateFieldChange('center_signatory_name', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Title</label>
                        <input
                          type="text"
                          value={templateForm.center_signatory_title}
                          onChange={event => handleTemplateFieldChange('center_signatory_title', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-bold uppercase tracking-wide text-slate-800">Right Signatory</h5>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Name</label>
                        <input
                          type="text"
                          value={templateForm.right_signatory_name}
                          onChange={event => handleTemplateFieldChange('right_signatory_name', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">Title</label>
                        <input
                          type="text"
                          value={templateForm.right_signatory_title}
                          onChange={event => handleTemplateFieldChange('right_signatory_title', event.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="bg-[linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)] p-5 xl:p-7">
            <div className="mx-auto max-w-[1120px] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    <FileSignature size={12} />
                    <span>Live Preview</span>
                  </div>
                  <h4 className="mt-1 text-lg font-bold text-slate-900">
                    {previewApplication ? `${previewApplication.nominee_name} Certificate Preview` : 'Certificate Preview'}
                  </h4>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  Updates as you type
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] xl:p-6">
                <div className="flex justify-center rounded-[24px] bg-slate-100 p-3 xl:p-4">
                  <div
                    style={previewCanvasStyle}
                    className={`relative aspect-[1.414/1] w-full overflow-hidden rounded-[20px] ${
                      previewBackgroundImage
                        ? 'border border-slate-200 bg-slate-100'
                        : 'border-8 border-[#d8aa43] bg-white'
                    }`}
                  >
                    {previewBackgroundImage && (
                      <>
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{ backgroundImage: `url(${previewBackgroundImage})` }}
                        />
                        <div className="absolute inset-0 bg-white/34" />
                      </>
                    )}

                    <div className="relative z-10 h-full rounded-[16px] bg-white">
                      {previewPdfUrl && !previewLoadError && (
                        <iframe
                          key={previewPdfUrl}
                          title="Certificate PDF Preview"
                          src={`${previewPdfUrl}#toolbar=0&navpanes=0&scrollbar=0&zoom=page-fit&pagemode=none`}
                          className="h-full w-full rounded-[16px] border-0 bg-white"
                        />
                      )}

                      {isPreviewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-white/88 text-sm font-medium text-slate-500">
                          Rendering certificate preview...
                        </div>
                      )}

                      {previewLoadError && !isPreviewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-white px-6 text-center text-sm text-red-600">
                          {previewLoadError}
                        </div>
                      )}

                      {!previewPdfUrl && !isPreviewLoading && !previewLoadError && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-white px-6 text-center text-sm text-slate-500">
                          Select a preview record to render the certificate.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
