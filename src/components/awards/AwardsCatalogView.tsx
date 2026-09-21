import React, { useState } from 'react';
import { Award } from '../../types';
import { 
  Award as AwardIcon, 
  CheckCircle2, 
  FileCheck, 
  Scale, 
  Plus, 
  FileText,
  Search
} from 'lucide-react';

interface AwardsCatalogViewProps {
  awards: Award[];
  onSelectAwardForNomination: (awardId: string) => void;
}

export const AwardsCatalogView: React.FC<AwardsCatalogViewProps> = ({
  awards,
  onSelectAwardForNomination
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAwards = awards.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="awards-catalog-container" className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            City of Tacloban PRAISE Guidelines
          </span>
          <h2 className="text-xl font-bold text-white mt-0.5">Awards Categories & Qualification Standards</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Civil Service Commission standardized criteria, weights, eligibility requirements, and documentary requirements.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-3 text-slate-400" />
        <input
          type="text"
          placeholder="Search award category or guidelines..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full text-xs pl-9 pr-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
        />
      </div>

      {/* Award Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredAwards.map(award => (
          <div
            key={award.id}
            id={`catalog-award-${award.id}`}
            className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between space-y-6"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-bold">
                  {award.code}
                </span>
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md">
                  Qualifying Cutoff: {award.min_qualifying_score}%
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mt-2">{award.name}</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {award.description}
              </p>

              {/* Criteria Section */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <Scale size={14} className="text-blue-600" />
                  <span>Evaluation Criteria & Weights</span>
                </h4>

                <div className="space-y-1.5">
                  {(award.criteria || []).map((crit, idx) => (
                    <div key={crit.id || idx} className="p-2.5 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-slate-800 truncate">{crit.criterion_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{crit.criterion_description}</p>
                      </div>
                      <span className="font-bold text-blue-600 shrink-0 font-mono">{crit.weight_percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Documentary Requirements Checklist */}
              {award.document_requirements && (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <FileCheck size={14} className="text-blue-600" />
                    <span>Mandatory Attachments ({award.document_requirements.length})</span>
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-1 pl-1">
                    {award.document_requirements.map(req => (
                      <li key={req.id} className="flex items-start gap-1.5 text-[11px]">
                        <CheckCircle2 size={13} className="text-green-600 shrink-0 mt-0.5" />
                        <span>{req.document_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => onSelectAwardForNomination(award.id)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Nominate Candidate for this Award</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
