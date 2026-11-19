import React, { useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { UserRole } from '../../types';

export const DownloadNominationButton: React.FC<{ applicationId: string; userRole: UserRole; appearance?: 'header' | 'list' | 'icon' }> = ({ applicationId, userRole, appearance = 'header' }) => {
  const pending = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    if (pending.current) return;
    pending.current = true; setDownloading(true); setError('');
    try {
      const { downloadNominationPdf } = await import('../../lib/nominationPdf');
      await downloadNominationPdf(applicationId, userRole);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate the nomination PDF. Please try again.');
    } finally {
      pending.current = false; setDownloading(false);
    }
  };
  return <div className={`flex min-w-0 flex-col gap-2 ${appearance === 'header' ? 'items-end' : ''}`}>
    <button type="button" onClick={event => { event.stopPropagation(); void download(); }} disabled={downloading} aria-busy={downloading} aria-label="Download nomination PDF" title="Download nomination form with signature and attachments" className={`inline-flex items-center justify-center gap-2 rounded-lg disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${appearance === 'icon' ? 'size-6 text-slate-400 hover:text-blue-600' : appearance === 'list' ? 'min-h-11 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100' : 'min-h-11 border border-slate-500 bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700'}`}>
      {downloading ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : <Download size={16} aria-hidden="true" />}
      {appearance !== 'icon' && (downloading ? 'Generating PDF...' : 'Download PDF')}
    </button>
    {error && <p role="alert" className={`max-w-lg whitespace-normal break-words text-sm leading-5 ${appearance === 'header' ? 'text-red-200' : 'text-red-700'}`}>{error}</p>}
  </div>;
};
