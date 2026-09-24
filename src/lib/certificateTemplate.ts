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
  form_a1_prepared_label: 'PREPARED BY (Nominator):',
  form_a1_prepared_name: '{nominator_name}',
  form_a1_prepared_title: '{nominator_position}',
  form_a1_verified_label: 'VERIFIED BY (Secretariat):',
  form_a1_verified_name: 'Atty. Paul Vincent G. Yu',
  form_a1_verified_title: 'PRAISE Secretariat Lead',
  form_a1_confirmed_label: 'CONFIRMED BY (HRMDO Head):',
  form_a1_confirmed_name: 'Marites S. Bocar',
  form_a1_confirmed_title: 'City Gov Dept Head II, HRMDO',
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
    form_a1_prepared_label: String(settings?.form_a1_prepared_label || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_prepared_label),
    form_a1_prepared_name: String(settings?.form_a1_prepared_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_prepared_name),
    form_a1_prepared_title: String(settings?.form_a1_prepared_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_prepared_title),
    form_a1_verified_label: String(settings?.form_a1_verified_label || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_verified_label),
    form_a1_verified_name: String(settings?.form_a1_verified_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_verified_name),
    form_a1_verified_title: String(settings?.form_a1_verified_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_verified_title),
    form_a1_confirmed_label: String(settings?.form_a1_confirmed_label || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_confirmed_label),
    form_a1_confirmed_name: String(settings?.form_a1_confirmed_name || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_confirmed_name),
    form_a1_confirmed_title: String(settings?.form_a1_confirmed_title || DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS.form_a1_confirmed_title),
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
    nominator_name: application.nominator_name,
    nominator_position: application.nominator_position,
  };

  return template.replace(/\{([a-z_]+)\}/gi, (_match, token) => replacements[token.toLowerCase()] || '');
}
