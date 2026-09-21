import React from 'react';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { Application, Award, Office } from '../../types';
import {
  Award as AwardIcon,
  Download,
  FileBarChart,
  FileSignature,
  FileText,
  Printer,
  Table,
} from 'lucide-react';

interface ReportsViewProps {
  applications: Application[];
  awards: Award[];
  offices: Office[];
  onNavigateToCertificateTemplate: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  applications,
  awards,
  offices,
  onNavigateToCertificateTemplate,
}) => {
  const latestAwardedApp = applications.find(application => application.status === 'Awarded') || applications[0];
  const sampleApplication = applications[0];

  const officeStats = offices.map(off => {
    const officeApplications = applications.filter(application => application.office_id === off.id);
    const awardedCount = officeApplications.filter(application => application.status === 'Awarded').length;
    const avgScore = officeApplications.length > 0
      ? (officeApplications.reduce((sum, application) => sum + (application.final_weighted_score || 0), 0) / officeApplications.length).toFixed(1)
      : '0.0';

    return {
      office: off,
      totalNominations: officeApplications.length,
      awardedCount,
      avgScore,
    };
  });

  const exportCSV = () => {
    const headers = ['Application Number', 'Nominee Name', 'Department', 'Award Category', 'Status', 'Weighted Score %', 'Date Submitted'];
    const rows = applications.map(application => [
      `"${application.application_number}"`,
      `"${application.nominee_name}"`,
      `"${application.office_name}"`,
      `"${application.award_name}"`,
      `"${application.status}"`,
      application.final_weighted_score || 0,
      `"${new Date(application.created_at).toLocaleDateString('en-PH')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Tacloban_PRAISE_Export_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="reports-view-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            City Government of Tacloban - HRMDO
          </span>
          <h2 className="text-xl font-bold text-white mt-0.5">PRAISE Official Reports & Dossier Generator</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Civil Service Commission standardized evaluation reports, ranking matrices, and certificates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer shadow-xs"
          >
            <Table size={14} />
            <span>Export CSV Dataset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-3 border border-blue-100">
              <FileBarChart size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Deliberation Matrix & Final Rankings</h4>
            <p className="text-xs text-slate-500 mt-1">
              Standardized CSC ranking summary matrix featuring criteria breakdown, weighted scores, and committee resolution lines.
            </p>
          </div>
          <button
            onClick={() => pdfGenerator.generateEvaluationMatrixReport(applications)}
            disabled={applications.length === 0}
            className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} />
            <span>Generate Ranking Matrix (PDF)</span>
          </button>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center mb-3 border border-amber-100">
              <AwardIcon size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Certificate of Recognition</h4>
            <p className="text-xs text-slate-500 mt-1">
              Print the latest certificate here, or open the separate certificate template workspace to edit wording, signatories, and preview layout.
            </p>
          </div>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => {
                if (!latestAwardedApp) {
                  return;
                }
                pdfGenerator.generateAwardCertificate(
                  latestAwardedApp,
                  awards.find(award => award.id === latestAwardedApp.award_id)
                );
              }}
              disabled={!latestAwardedApp}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-md inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={14} />
              <span>Print Latest Certificate (PDF)</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToCertificateTemplate}
              className="w-full py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSignature size={14} />
              <span>Certificate Template</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mb-3 border border-slate-200">
              <FileText size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Nomination Summary Dossier (Form A-1)</h4>
            <p className="text-xs text-slate-500 mt-1">
              Full dossier including justification, certified accomplishments, and verified documentary attachments checklist.
            </p>
          </div>
          <button
            onClick={() => {
              if (!sampleApplication) {
                return;
              }
              pdfGenerator.generateApplicationSummary(
                sampleApplication,
                awards.find(award => award.id === sampleApplication.award_id)
              );
            }}
            disabled={!sampleApplication}
            className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} />
            <span>Download Sample Form A-1</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Tacloban LGU Department Participation & Output</h3>
            <p className="text-xs text-slate-500">Summary of nominations filed, average evaluation ratings, and awards conferred.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Department Name</th>
                <th className="px-4 py-3">Department Head</th>
                <th className="px-4 py-3 text-center">Total Nominees</th>
                <th className="px-4 py-3 text-center">Conferred Awards</th>
                <th className="px-4 py-3 text-center">Average Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {officeStats.map((stat, index) => (
                <tr key={stat.office.id || index} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {stat.office.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {stat.office.head_name}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-blue-600">
                    {stat.totalNominations}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-amber-600">
                    {stat.awardedCount}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold">
                    {stat.avgScore}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
