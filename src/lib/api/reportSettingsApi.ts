import { CertificateTemplateSettings } from '../../types';
import { apiRequest } from './client';
import { normalizeCertificateBackgroundUrl, normalizeStoredCertificateTemplateSettings, toProjectRelativePath } from './normalizers';
import { state } from './state';

export const reportSettingsApi = {
  getCertificateTemplateSettings(): CertificateTemplateSettings {
    return { ...state.cachedCertificateTemplateSettings };
  },

  async updateCertificateTemplateSettings(
    settings: Omit<CertificateTemplateSettings, 'updated_at'>
  ): Promise<CertificateTemplateSettings> {
    const payload = {
      ...Object.fromEntries(Object.entries(settings).filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))),
      background_image_url: toProjectRelativePath(settings.background_image_url || ''),
    };

    const updatedSettings = normalizeStoredCertificateTemplateSettings(await apiRequest<any>('report_settings.php', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }));
    state.cachedCertificateTemplateSettings = updatedSettings;
    return updatedSettings;
  },

  async uploadCertificateTemplateBackground(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('background_image', file);

    const payload = await apiRequest<any>('report_settings.php', {
      method: 'POST',
      body: formData,
    });

    return normalizeCertificateBackgroundUrl(payload?.background_image_url);
  },
};
