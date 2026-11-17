import { apiRequest } from './client';

export async function uploadFile<T>(endpoint: string, field: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  if (import.meta.env?.VITE_CLOUD_UPLOADS !== '1') {
    const form = new FormData();
    form.append(field, file);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return apiRequest<T>(endpoint, { method: 'POST', body: form });
  }

  const upload = await apiRequest<{ upload_id: string; chunk_size: number }>('uploads.php?action=start', {
    method: 'POST',
    body: JSON.stringify({
      target: endpoint === 'documents.php' ? 'documents' : 'certificate',
      file_name: file.name, file_size: file.size, fields,
    }),
  });
  // Each request stays below Vercel's request body limit, including multipart framing.
  for (let offset = 0, index = 0; offset < file.size; offset += upload.chunk_size, index++) {
    const part = new FormData();
    part.append('upload_id', upload.upload_id);
    part.append('part_no', String(index));
    part.append('chunk', file.slice(offset, offset + upload.chunk_size), 'chunk');
    await apiRequest('uploads.php?action=part', { method: 'POST', body: part });
  }
  return apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify({ upload_id: upload.upload_id }) });
}
