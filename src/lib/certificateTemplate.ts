import { Application, CertificateTemplateSettings } from '../types';

export const DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS: CertificateTemplateSettings = {
  citation_text:
    'For exemplary dedication, outstanding performance, and unwavering commitment to public service excellence, having met all criteria and qualifying standards under the City of Tacloban PRAISE Guidelines.',
  conferment_text:
    'Conferred this {award_date} at Tacloban City Hall, Kanhuraw Hill, Tacloban City, Leyte, Philippines.',
  left_signatory_name: 'Marites S. Bocar',
  left_signatory_title: 'City Government Dept. Head II, HRMDO',
  center_signatory_name: 'Atty. Irene V. Chiu',
  center_signatory_title: 'City Administrator / PRAISE Chairperson',
  right_signatory_name: 'Hon. Alfred S. Romualdez',
  right_signatory_title: 'City Mayor, Tacloban City',
  background_image_url: '',
};

export function normalizeCertificateTemplateSettings(
  settings?: Partial<CertificateTemplateSettings> | null
): CertificateTemplateSettings {
  return {
    citation_text: String(settings?.citation_text || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.citation_text),
    conferment_text: String(settings?.conferment_text || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.conferment_text),
    left_signatory_name: String(settings?.left_signatory_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.left_signatory_name),
    left_signatory_title: String(settings?.left_signatory_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.left_signatory_title),
    center_signatory_name: String(settings?.center_signatory_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.center_signatory_name),
    center_signatory_title: String(settings?.center_signatory_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.center_signatory_title),
    right_signatory_name: String(settings?.right_signatory_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.right_signatory_name),
    right_signatory_title: String(settings?.right_signatory_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.right_signatory_title),
    background_image_url: String(settings?.background_image_url || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.background_image_url),
    updated_at: settings?.updated_at ? String(settings.updated_at) : undefined,
  };
}

export function renderCertificateTemplateText(template: string, application: Application): string {
  const awardDate = application.award_date
    ? new Date(application.award_date).toLocaleDateString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

  const replacements: Record<string, string> = {
    nominee_name: application.nominee_name,
    position_title: application.position_title,
    office_name: application.office_name,
    award_name: application.award_name || 'Tacloban PRAISE Award',
    award_date: awardDate,
    award_year: String(application.award_year || new Date().getFullYear()),
    application_number: application.application_number,
    weighted_score: `${application.final_weighted_score || 95}%`,
  };

  return template.replace(/\{([a-z_]+)\}/gi, (_match, token) => replacements[token.toLowerCase()] || '');
}
