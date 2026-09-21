import React, { useEffect, useState } from 'react';
import { Application, Award, Office, UserProfile, UserRole } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { 
  Users, 
  Award as AwardIcon, 
  Building2, 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2,
  History, 
  Download, 
  CheckCircle2, 
  Scale, 
  ShieldCheck, 
  Sparkles
} from 'lucide-react';
import { praiseService } from '../../lib/supabase';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { ConfirmationModal } from '../common/ConfirmationModal';

type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  errorMessage: string;
  onConfirm: () => Promise<void>;
};

type AwardModalTab = 'details' | 'criteria' | 'attachments';

interface AdminDashboardProps {
  applications: Application[];
  awards: Award[];
  offices: Office[];
  users: UserProfile[];
  currentUser: UserProfile;
  initialSubTab: 'overview' | 'awards' | 'offices' | 'users';
  onRefreshData: () => void;
  onNavigateToNomination: () => void;
  onSelectApplication: (app: Application) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  applications,
  awards,
  offices,
  users,
  currentUser,
  initialSubTab,
  onRefreshData,
  onNavigateToNomination,
  onSelectApplication
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'applications' | 'awards' | 'offices' | 'users'>(initialSubTab);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAwardFilter, setSelectedAwardFilter] = useState('ALL');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedYearFilter, setSelectedYearFilter] = useState('ALL');

  // Modals & Forms
  const [auditApp, setAuditApp] = useState<Application | null>(null);
  const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);
  const [editingAward, setEditingAward] = useState<Award | null>(null);
  const [activeAwardModalTab, setActiveAwardModalTab] = useState<AwardModalTab>('details');

  // Award Form State
  const [awardName, setAwardName] = useState('');
  const [awardCode, setAwardCode] = useState('');
  const [awardDescription, setAwardDescription] = useState('');
  const [awardYear, setAwardYear] = useState(new Date().getFullYear());
  const [awardMinScore, setAwardMinScore] = useState(85);
  const [awardCriteria, setAwardCriteria] = useState<Array<{
    id: string;
    criterion_name: string;
    criterion_description: string;
    weight_percentage: number;
    max_score: number;
  }>>([]);
  const [awardDocumentRequirements, setAwardDocumentRequirements] = useState<Array<{
    id: string;
    document_name: string;
    description: string;
    is_mandatory: boolean;
  }>>([]);

  // Office Form State
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [officeName, setOfficeName] = useState('');
  const [officeCode, setOfficeCode] = useState('');
  const [officeHead, setOfficeHead] = useState('');
  const [officeHeadTitle, setOfficeHeadTitle] = useState('');

  // User Role Form State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newUserRole, setNewUserRole] = useState<UserRole>('NOMINEE');
  const [newUserOffice, setNewUserOffice] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  // User Creation Form State
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createUserName, setCreateUserName] = useState('');
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserRole, setCreateUserRole] = useState<UserRole>('NOMINEE');
  const [createUserOffice, setCreateUserOffice] = useState('');
  const [createUserPosition, setCreateUserPosition] = useState('');
  const [createUserPassword, setCreateUserPassword] = useState('ChangeMe123!');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Statistics Calculations
  const totalApps = applications.length;
  const pendingVerification = applications.filter(a => a.status === 'For Verification' || a.status === 'Submitted').length;
  const pendingEvaluation = applications.filter(a => a.status === 'For Evaluation' || a.status === 'Under Evaluation').length;
  const forDeliberation = applications.filter(a => a.status === 'For Deliberation' || a.status === 'Evaluation Completed').length;
  const approved = applications.filter(a => a.status === 'Approved').length;
  const awarded = applications.filter(a => a.status === 'Awarded').length;
  const notApproved = applications.filter(a => a.status === 'Not Approved').length;

  // Filtered Applications
  const filteredApplications = applications.filter(app => {
    const matchesSearch = 
      app.nominee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.application_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.position_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.office_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAward = selectedAwardFilter === 'ALL' || app.award_id === selectedAwardFilter;
    const matchesOffice = selectedOfficeFilter === 'ALL' || app.office_id === selectedOfficeFilter;
    const matchesStatus = selectedStatusFilter === 'ALL' || app.status === selectedStatusFilter;
    const matchesYear = selectedYearFilter === 'ALL' || String(app.award_year) === selectedYearFilter;

    return matchesSearch && matchesAward && matchesOffice && matchesStatus && matchesYear;
  });

  const criteriaTotalWeight = awardCriteria.reduce((sum, criterion) => sum + Number(criterion.weight_percentage || 0), 0);

  // Award Modal Open Handler
  const handleOpenAwardModal = (award?: Award) => {
    setActiveAwardModalTab('details');
    if (award) {
      setEditingAward(award);
      setAwardName(award.name);
      setAwardCode(award.code);
      setAwardDescription(award.description);
      setAwardYear(award.award_year);
      setAwardMinScore(award.min_qualifying_score);
      setAwardCriteria(
        (award.criteria || []).map(c => ({
          id: c.id,
          criterion_name: c.criterion_name,
          criterion_description: c.criterion_description,
          weight_percentage: c.weight_percentage,
          max_score: c.max_score
        }))
      );
      setAwardDocumentRequirements(
        (award.document_requirements || []).map(requirement => ({
          id: requirement.id,
          document_name: requirement.document_name,
          description: requirement.description,
          is_mandatory: requirement.is_mandatory,
        }))
      );
    } else {
      setEditingAward(null);
      setAwardName('');
      setAwardCode('');
      setAwardDescription('');
      setAwardYear(new Date().getFullYear());
      setAwardMinScore(85);
      setAwardCriteria([
        { id: `c-1`, criterion_name: 'Quality and Consistency', criterion_description: 'Standard of output', weight_percentage: 35, max_score: 100 },
        { id: `c-2`, criterion_name: 'Productivity & Citizen Impact', criterion_description: 'Tangible public value', weight_percentage: 30, max_score: 100 },
        { id: `c-3`, criterion_name: 'Initiative & Ethics', criterion_description: 'Proactiveness and integrity', weight_percentage: 35, max_score: 100 },
      ]);
      setAwardDocumentRequirements([]);
    }
    setIsAwardModalOpen(true);
  };

  const handleSaveAward = async () => {
    if (!awardName.trim() || !awardCode.trim()) {
      alert('Award Name and Code are required.');
      return;
    }

    if (!Number.isInteger(awardYear) || awardYear < 2020 || awardYear > 2100) {
      alert('Award Year must be between 2020 and 2100.');
      return;
    }

    if (!Number.isFinite(awardMinScore) || awardMinScore < 0 || awardMinScore > 100) {
      alert('Minimum Qualifying Score must be between 0 and 100.');
      return;
    }

    if (awardCriteria.length === 0 || awardCriteria.some(criterion => !criterion.criterion_name.trim())) {
      alert('Add at least one named evaluation criterion.');
      return;
    }

    if (awardDocumentRequirements.some(requirement => !requirement.document_name.trim())) {
      alert('Each attachment requirement must have a document name.');
      return;
    }

    const totalWeight = awardCriteria.reduce((sum, c) => sum + Number(c.weight_percentage), 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      alert(`Criterion weights must sum exactly to 100%. Current total: ${totalWeight}%`);
      return;
    }

    setIsSaving(true);

    try {
      if (editingAward) {
        await praiseService.updateAward(editingAward.id, {
          name: awardName,
          code: awardCode,
          description: awardDescription,
          award_year: awardYear,
          min_qualifying_score: awardMinScore,
          criteria: awardCriteria.map(c => ({
            ...c,
            award_id: editingAward.id
          })),
          document_requirements: awardDocumentRequirements.map(requirement => ({
            ...requirement,
            award_id: editingAward.id,
          })),
          eligibility_requirements: editingAward.eligibility_requirements || []
        });
      } else {
        await praiseService.createAward({
          name: awardName,
          code: awardCode,
          description: awardDescription,
          award_year: awardYear,
          min_qualifying_score: awardMinScore,
          is_active: true,
          criteria: awardCriteria.map(c => ({
            ...c,
            award_id: ''
          })),
          document_requirements: awardDocumentRequirements.map(requirement => ({
            ...requirement,
            award_id: '',
          })),
          eligibility_requirements: []
        });
      }

      setIsAwardModalOpen(false);
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save the award configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAward = (award: Award) => {
    const applicationCount = applications.filter(application => application.award_id === award.id).length;

    if (applicationCount > 0) {
      alert(`Cannot delete ${award.name} because it is linked to ${applicationCount} nomination record${applicationCount === 1 ? '' : 's'}.`);
      return;
    }

    setConfirmationRequest({
      title: 'Delete Award Category?',
      message: `Permanently delete ${award.name}? Its criteria, eligibility rules, and document requirements will also be removed.`,
      confirmLabel: 'Delete Award',
      errorMessage: 'Failed to delete the award category.',
      onConfirm: async () => {
        await praiseService.deleteAward(award.id);
        await onRefreshData();
      },
    });
  };

  const resetOfficeForm = () => {
    setEditingOffice(null);
    setOfficeName('');
    setOfficeCode('');
    setOfficeHead('');
    setOfficeHeadTitle('');
  };

  const getOfficeDependencyCounts = (officeId: string) => ({
    profiles: users.filter(user => user.office_id === officeId).length,
    applications: applications.filter(application => application.office_id === officeId).length,
  });

  const describeOfficeDependencies = (counts: { profiles: number; applications: number }) => {
    const details: string[] = [];

    if (counts.profiles > 0) {
      details.push(`${counts.profiles} user account${counts.profiles === 1 ? '' : 's'}`);
    }

    if (counts.applications > 0) {
      details.push(`${counts.applications} nomination record${counts.applications === 1 ? '' : 's'}`);
    }

    return details.join(' and ');
  };

  const handleOpenOfficeModal = (office?: Office) => {
    if (office) {
      setEditingOffice(office);
      setOfficeName(office.name);
      setOfficeCode(office.code);
      setOfficeHead(office.head_name);
      setOfficeHeadTitle(office.head_title);
    } else {
      resetOfficeForm();
    }
    setIsOfficeModalOpen(true);
  };

  const handleSaveOffice = async () => {
    if (!officeName.trim() || !officeCode.trim() || !officeHead.trim()) {
      alert('All office fields are required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingOffice) {
        await praiseService.updateOffice(editingOffice.id, {
          name: officeName,
          code: officeCode,
          head_name: officeHead,
          head_title: officeHeadTitle || 'Department Head',
          is_active: editingOffice.is_active
        });
      } else {
        await praiseService.createOffice({
          name: officeName,
          code: officeCode,
          head_name: officeHead,
          head_title: officeHeadTitle || 'Department Head',
          is_active: true
        });
      }

      setIsOfficeModalOpen(false);
      resetOfficeForm();
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to ${editingOffice ? 'update' : 'create'} the office.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOffice = async (office: Office) => {
    const dependencyCounts = getOfficeDependencyCounts(office.id);

    if (dependencyCounts.profiles > 0 || dependencyCounts.applications > 0) {
      alert(`Cannot delete ${office.name} while it is linked to ${describeOfficeDependencies(dependencyCounts)}.`);
      return;
    }

    setConfirmationRequest({
      title: 'Delete Office or Department?',
      message: `${office.name} will be removed from the active Offices & Departments list.`,
      confirmLabel: 'Delete Office',
      errorMessage: 'Failed to delete the office.',
      onConfirm: async () => {
        await praiseService.deleteOffice(office.id);
        await onRefreshData();
      },
    });
  };

  const handleDeleteNomination = async (application: Application) => {
    setConfirmationRequest({
      title: 'Delete Nomination?',
      message: `Permanently delete ${application.application_number} for ${application.nominee_name}? This also removes its documents, endorsements, evaluations, history, and notifications.`,
      confirmLabel: 'Delete Nomination',
      errorMessage: 'Failed to delete the nomination.',
      onConfirm: async () => {
        await praiseService.deleteNomination(application.id);
        await onRefreshData();
      },
    });
  };

  const handleUpdateUserRole = async () => {
    if (!editingUser) return;
    const off = offices.find(o => o.id === newUserOffice);
    setIsSaving(true);
    try {
      await praiseService.updateUserRole(
        editingUser.id,
        newUserRole,
        newUserOffice || undefined,
        off?.name,
        resetPassword.trim() || undefined
      );
      setEditingUser(null);
      setResetPassword('');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update the user account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === currentUser.id) {
      alert('You cannot delete your own account.');
      return;
    }

    setConfirmationRequest({
      title: 'Delete User Account?',
      message: `Permanently delete the account for ${user.full_name}? This cannot be undone.`,
      confirmLabel: 'Delete User',
      errorMessage: 'Failed to delete the user account.',
      onConfirm: async () => {
        await praiseService.deleteUser(user.id);
        await onRefreshData();
      },
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmationRequest) {
      return;
    }

    setIsSaving(true);
    try {
      await confirmationRequest.onConfirm();
      setConfirmationRequest(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : confirmationRequest.errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createUserName.trim() || !createUserEmail.trim() || !createUserPassword.trim()) {
      alert('Full name, email, and password are required.');
      return;
    }

    const selectedOffice = offices.find(office => office.id === createUserOffice);

    setIsSaving(true);
    try {
      await praiseService.createUser({
        full_name: createUserName.trim(),
        email: createUserEmail.trim(),
        role: createUserRole,
        office_id: createUserOffice || undefined,
        office_name: selectedOffice?.name,
        position_title: createUserPosition.trim() || undefined,
        employee_id: undefined,
        contact_number: undefined,
        barangay: undefined,
        password: createUserPassword,
        is_active: true,
        must_change_password: true
      });
      setIsCreateUserModalOpen(false);
      setCreateUserName('');
      setCreateUserEmail('');
      setCreateUserRole('NOMINEE');
      setCreateUserOffice('');
      setCreateUserPosition('');
      setCreateUserPassword('ChangeMe123!');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create the user account.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="admin-dashboard-container" className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Total Filings</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalApps}</span>
            <span className="text-blue-600 text-[10px] font-bold">2026 Cycle</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Verification</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-amber-600">{pendingVerification}</span>
            <span className="text-amber-600 text-[10px] font-bold">Secretariat</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Evaluation</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-blue-600">{pendingEvaluation}</span>
            <span className="text-blue-600 text-[10px] font-bold">Assessors</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Deliberation</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-purple-600">{forDeliberation}</span>
            <span className="text-purple-600 text-[10px] font-bold">Committee</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Approved</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-green-600">{approved}</span>
            <span className="text-green-600 text-[10px] font-bold">Qualified</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs bg-linear-to-br from-amber-50/40 to-yellow-50/40">
          <p className="text-[10px] uppercase font-bold text-amber-700 mb-1">Awarded</p>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-amber-800">{awarded}</span>
            <span className="text-amber-700 text-[10px] font-bold">Conferred</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:gap-2">
          {[
            { id: 'overview', label: 'All Applications', icon: FileText },
            { id: 'awards', label: 'Awards & Criteria', icon: AwardIcon },
            { id: 'offices', label: 'Offices & Departments', icon: Building2 },
            { id: 'users', label: 'User Roles & Access', icon: Users },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <button
            onClick={() => pdfGenerator.generateEvaluationMatrixReport(applications)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Download size={14} />
            <span>Deliberation Matrix (PDF)</span>
          </button>

          <button
            onClick={onNavigateToNomination}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>New Nomination</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: ALL APPLICATIONS */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search nominee, application no., office..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <select
                value={selectedAwardFilter}
                onChange={e => setSelectedAwardFilter(e.target.value)}
                className="w-full text-xs p-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white"
              >
                <option value="ALL">All Award Categories</option>
                {awards.map(aw => (
                  <option key={aw.id} value={aw.id}>{aw.name}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedOfficeFilter}
                onChange={e => setSelectedOfficeFilter(e.target.value)}
                className="w-full text-xs p-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white"
              >
                <option value="ALL">All Departments</option>
                {offices.map(off => (
                  <option key={off.id} value={off.id}>{off.name}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="w-full text-xs p-2 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="Submitted">Submitted</option>
                <option value="For Endorsement">For Endorsement</option>
                <option value="Endorsed">Endorsed</option>
                <option value="For Verification">For Verification</option>
                <option value="Verified">Verified</option>
                <option value="For Evaluation">For Evaluation</option>
                <option value="Evaluation Completed">Evaluation Completed</option>
                <option value="For Deliberation">For Deliberation</option>
                <option value="Approved">Approved</option>
                <option value="Awarded">Awarded</option>
                <option value="Not Approved">Not Approved</option>
              </select>
            </div>
          </div>

          {/* Applications Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="mobile-scroll-table overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Reference No.</th>
                    <th className="px-4 py-3">Nominee</th>
                    <th className="px-4 py-3">Department / Office</th>
                    <th className="px-4 py-3">Award Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No applications matched your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map(app => (
                      <tr
                        key={app.id}
                        id={`app-row-${app.id}`}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3.5 font-mono font-bold text-blue-600">
                          {app.application_number}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900">
                          <div>{app.nominee_name}</div>
                          <div className="text-[11px] text-slate-400 font-normal">{app.position_title}</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {app.office_name}
                        </td>
                        <td className="px-4 py-3.5 text-slate-800 font-medium">
                          {app.award_name}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={app.status} size="sm" />
                        </td>
                        <td className="px-4 py-3.5">
                          {app.final_weighted_score ? (
                            <div>
                              <span className="font-bold text-slate-800">{app.final_weighted_score}%</span>
                              <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                <div 
                                  className={`h-full ${app.final_weighted_score >= 85 ? 'bg-green-600' : 'bg-blue-600'}`} 
                                  style={{ width: `${Math.min(app.final_weighted_score, 100)}%` }} 
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <button
                              onClick={() => onSelectApplication(app)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[11px] transition-colors cursor-pointer"
                            >
                              Track Stage
                            </button>
                            <button
                              onClick={() => setAuditApp(app)}
                              title="Audit Trail"
                              className="inline-flex size-6 items-center justify-center text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            >
                              <History size={14} />
                            </button>
                            <button
                              onClick={() => pdfGenerator.generateApplicationSummary(app, awards.find(a => a.id === app.award_id))}
                              title="Download PDF Dossier"
                              className="inline-flex size-6 items-center justify-center text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteNomination(app)}
                              disabled={isSaving}
                              title={`Delete nomination ${app.application_number}`}
                              className="inline-flex size-6 items-center justify-center text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 rounded cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: AWARDS & CRITERIA CONFIGURATION */}
      {activeSubTab === 'awards' && (
        <div className="space-y-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Tacloban PRAISE Award Categories</h3>
              <p className="text-xs text-slate-500">Configure evaluation criteria, weights (sum 100%), eligibility, and document requirements.</p>
            </div>
            <button
              id="add-new-award-btn"
              onClick={() => handleOpenAwardModal()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Create New Award Category</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {awards.map(award => (
              <div
                key={award.id}
                id={`award-card-${award.id}`}
                className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-bold">
                      {award.code}
                    </span>
                    <span className="text-xs text-slate-400">Min Score: <strong>{award.min_qualifying_score}%</strong></span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{award.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{award.description}</p>

                  {/* Criteria summary */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Weighted Criteria ({(award.criteria || []).length}):
                    </p>
                    <div className="space-y-1">
                      {(award.criteria || []).map(c => (
                        <div key={c.id} className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="truncate pr-2">{c.criterion_name}</span>
                          <span className="font-semibold text-blue-600">{c.weight_percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenAwardModal(award)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={13} />
                    <span>Edit Criteria & Weights</span>
                  </button>
                  <button
                    onClick={() => handleDeleteAward(award)}
                    disabled={applications.some(application => application.award_id === award.id) || isSaving}
                    title={applications.some(application => application.award_id === award.id) ? 'Cannot delete an award linked to nomination records' : `Delete ${award.name}`}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-xs font-semibold rounded-lg text-red-700 inline-flex items-center gap-1 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: OFFICES & DEPARTMENTS */}
      {activeSubTab === 'offices' && (
        <div className="space-y-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">LGU Offices & Departments</h3>
              <p className="text-xs text-slate-500">Official administrative units and Department Heads of Tacloban City Hall.</p>
              <p className="text-[11px] text-slate-400 mt-1">Only departments without linked users or nomination records can be permanently deleted.</p>
            </div>
            <button
              onClick={() => handleOpenOfficeModal()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Department</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="mobile-scroll-table overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Department Name</th>
                  <th className="px-4 py-3">Department Head</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {offices.map(off => {
                  const dependencyCounts = getOfficeDependencyCounts(off.id);
                  const canDeleteOffice = dependencyCounts.profiles === 0 && dependencyCounts.applications === 0;
                  const deleteTooltip = canDeleteOffice
                    ? `Delete ${off.name}`
                    : `Cannot delete while linked to ${describeOfficeDependencies(dependencyCounts)}`;

                  return (
                    <tr key={off.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">{off.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{off.name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{off.head_name}</td>
                      <td className="px-4 py-3 text-slate-500">{off.head_title}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Active
                          </span>
                          {!canDeleteOffice && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              In Use
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleOpenOfficeModal(off)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteOffice(off)}
                            disabled={!canDeleteOffice || isSaving}
                            title={deleteTooltip}
                            className={`px-2.5 py-1 font-semibold rounded text-[11px] inline-flex items-center gap-1 transition-colors ${
                              canDeleteOffice
                                ? 'bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: USER ROLES & ACCESS */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">PRAISE Users & Role Assignments</h3>
              <p className="text-xs text-slate-500">Manage 5 user tiers: Administrator, Secretariat, Head of Office, Evaluator, Nominee.</p>
            </div>
            <button
              onClick={() => {
                setCreateUserOffice('');
                setIsCreateUserModalOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Create User</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="mobile-scroll-table overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">User Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Department / Office</th>
                  <th className="px-4 py-3">Assigned Role</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {u.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.office_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setNewUserRole(u.role);
                            setNewUserOffice(u.office_id || offices[0]?.id || '');
                            setResetPassword('');
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded text-[11px] cursor-pointer"
                        >
                          Change Role
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={u.id === currentUser.id || isSaving}
                          title={u.id === currentUser.id ? 'You cannot delete your own account' : `Delete ${u.full_name}`}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Award Edit Modal */}
      {isAwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 my-8">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingAward ? `Configure Award: ${editingAward.name}` : 'Create New Award Category'}
            </h3>

            <div role="tablist" aria-label="Award configuration sections" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {([
                ['details', 'Award Details'],
                ['criteria', `Criteria (${awardCriteria.length})`],
                ['attachments', `Attachments (${awardDocumentRequirements.length})`],
              ] as Array<[AwardModalTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeAwardModalTab === tab}
                  onClick={() => setActiveAwardModalTab(tab)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors cursor-pointer ${activeAwardModalTab === tab ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeAwardModalTab === 'details' && (
              <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Award Title *</label>
                <input
                  type="text"
                  value={awardName}
                  onChange={e => setAwardName(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Award Code *</label>
                <input
                  type="text"
                  value={awardCode}
                  onChange={e => setAwardCode(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Award Year *</label>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={awardYear}
                  onChange={e => setAwardYear(Number(e.target.value))}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Minimum Qualifying Score *</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={awardMinScore}
                  onChange={e => setAwardMinScore(Number(e.target.value))}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Description</label>
              <textarea
                rows={2}
                value={awardDescription}
                onChange={e => setAwardDescription(e.target.value)}
                className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
              </>
            )}

            {/* Criteria Editor */}
            {activeAwardModalTab === 'criteria' && (
            <div role="tabpanel" className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-100">Evaluation Criteria & Percentage Weights</label>
                <span className="text-xs font-bold text-blue-600">
                  Total: {criteriaTotalWeight}% / 100%
                </span>
              </div>

              {criteriaTotalWeight >= 100 && (
                <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
                  Allocation limit reached: criteria weights are already 100%. Reduce an existing weight before adding another criterion.
                </p>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {awardCriteria.map((crit, idx) => (
                  <div key={crit.id || idx} className="p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Criterion Name"
                        value={crit.criterion_name}
                        onChange={e => {
                          const updated = [...awardCriteria];
                          updated[idx].criterion_name = e.target.value;
                          setAwardCriteria(updated);
                        }}
                        className="flex-1 min-w-0 p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <div className="flex items-center gap-1 w-24 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, 100 - awardCriteria.reduce((sum, criterion, index) => index === idx ? sum : sum + Number(criterion.weight_percentage || 0), 0))}
                        step={0.01}
                        value={crit.weight_percentage}
                        onChange={e => {
                          const requestedWeight = Number(e.target.value);
                          const otherWeights = awardCriteria.reduce(
                            (sum, criterion, index) => index === idx ? sum : sum + Number(criterion.weight_percentage || 0),
                            0
                          );
                          const maximumWeight = Math.max(0, 100 - otherWeights);
                          const updated = [...awardCriteria];
                          updated[idx].weight_percentage = Number.isFinite(requestedWeight)
                            ? Math.min(Math.max(requestedWeight, 0), maximumWeight)
                            : 0;
                          setAwardCriteria(updated);
                        }}
                        className="w-14 p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-center font-bold"
                      />
                      <span className="text-slate-600 dark:text-slate-300">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAwardCriteria(previous => previous.filter((_, index) => index !== idx))}
                        title={`Remove ${crit.criterion_name || 'criterion'}`}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-100 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Criterion description (optional)"
                      value={crit.criterion_description}
                      onChange={e => {
                        const updated = [...awardCriteria];
                        updated[idx].criterion_description = e.target.value;
                        setAwardCriteria(updated);
                      }}
                      className="w-full p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (criteriaTotalWeight >= 100) return;
                  setAwardCriteria(previous => ([
                    ...previous,
                    {
                      id: `crit-${Date.now()}-${previous.length + 1}`,
                      criterion_name: '',
                      criterion_description: '',
                      weight_percentage: 0,
                      max_score: 100,
                    },
                  ]));
                }}
                disabled={criteriaTotalWeight >= 100}
                title={criteriaTotalWeight >= 100 ? 'Remove or reduce an existing criterion before adding another one.' : 'Add Criterion'}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={13} />
                <span>Add Criterion</span>
              </button>
            </div>
            )}

            {activeAwardModalTab === 'attachments' && (
            <div role="tabpanel" className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-100">Documentary Attachment Requirements</label>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Specify the documents nominees must upload with their nomination.</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {awardDocumentRequirements.length} item{awardDocumentRequirements.length === 1 ? '' : 's'}
                </span>
              </div>

              {awardDocumentRequirements.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {awardDocumentRequirements.map((requirement, index) => (
                    <div key={requirement.id || index} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs space-y-2 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Document name, e.g. Updated Personal Data Sheet"
                          value={requirement.document_name}
                          onChange={event => setAwardDocumentRequirements(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, document_name: event.target.value } : item))}
                          className="min-w-0 flex-1 rounded border border-slate-300 bg-white p-1.5 text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                        <label className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={requirement.is_mandatory}
                            onChange={event => setAwardDocumentRequirements(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, is_mandatory: event.target.checked } : item))}
                            className="size-3.5 accent-blue-600"
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => setAwardDocumentRequirements(previous => previous.filter((_, itemIndex) => itemIndex !== index))}
                          title={`Remove ${requirement.document_name || 'attachment requirement'}`}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-100 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Instructions or description (optional)"
                        value={requirement.description}
                        onChange={event => setAwardDocumentRequirements(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                        className="w-full rounded border border-slate-300 bg-white p-1.5 text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setAwardDocumentRequirements(previous => ([
                  ...previous,
                  {
                    id: `dreq-${Date.now()}-${previous.length + 1}`,
                    document_name: '',
                    description: '',
                    is_mandatory: true,
                  },
                ]))}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus size={13} />
                <span>Add Attachment Requirement</span>
              </button>
            </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setIsAwardModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAward}
                disabled={isSaving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Saving...' : 'Save Award Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Office Modal */}
      {isOfficeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingOffice ? `Edit Office: ${editingOffice.name}` : 'Add New Office / Department'}
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Office Name *</label>
                <input
                  type="text"
                  placeholder="e.g. City Tourism Office"
                  value={officeName}
                  onChange={e => setOfficeName(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Office Code *</label>
                <input
                  type="text"
                  placeholder="e.g. CTO-TOUR"
                  value={officeCode}
                  onChange={e => setOfficeCode(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Department Head Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Maria C. Santos"
                  value={officeHead}
                  onChange={e => setOfficeHead(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Head Official Title</label>
                <input
                  type="text"
                  placeholder="e.g. City Tourism Officer"
                  value={officeHeadTitle}
                  onChange={e => setOfficeHeadTitle(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => {
                  setIsOfficeModalOpen(false);
                  resetOfficeForm();
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOffice}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Saving...' : editingOffice ? 'Save Office Changes' : 'Add Department'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Create User Account</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Full Name *</label>
                <input
                  type="text"
                  value={createUserName}
                  onChange={e => setCreateUserName(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Email Address *</label>
                <input
                  type="email"
                  value={createUserEmail}
                  onChange={e => setCreateUserEmail(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Role *</label>
                <select
                  value={createUserRole}
                  onChange={e => {
                    const role = e.target.value as UserRole;
                    setCreateUserRole(role);
                    if (role === 'ADMINISTRATOR') {
                      setCreateUserOffice('');
                    }
                  }}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                  <option value="SECRETARIAT">SECRETARIAT</option>
                  <option value="HEAD_OF_OFFICE">HEAD OF OFFICE</option>
                  <option value="EVALUATOR">EVALUATOR</option>
                  <option value="NOMINEE">NOMINEE</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Assigned Department (optional for administrators)</label>
                <select
                  value={createUserOffice}
                  onChange={e => setCreateUserOffice(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {offices.map(office => (
                    <option key={office.id} value={office.id}>{office.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Position Title</label>
                <input
                  type="text"
                  value={createUserPosition}
                  onChange={e => setCreateUserPosition(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Initial Password *</label>
                <input
                  type="text"
                  value={createUserPassword}
                  onChange={e => setCreateUserPassword(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Marked for password change after first login.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setIsCreateUserModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Assignment Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Assign Role for {editingUser.full_name}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Select Role *</label>
                <select
                  value={newUserRole}
                  onChange={e => {
                    const role = e.target.value as UserRole;
                    setNewUserRole(role);
                    if (role === 'ADMINISTRATOR') {
                      setNewUserOffice('');
                    }
                  }}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="ADMINISTRATOR">ADMINISTRATOR (Full PRAISE System Control)</option>
                  <option value="SECRETARIAT">SECRETARIAT (Document Verification & Routing)</option>
                  <option value="HEAD_OF_OFFICE">HEAD OF OFFICE (Department Endorsement)</option>
                  <option value="EVALUATOR">EVALUATOR (Scoring & Assessment)</option>
                  <option value="NOMINEE">NOMINEE (Applicant / Volunteer)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Assigned Department (optional for administrators)</label>
                <select
                  value={newUserOffice}
                  onChange={e => setNewUserOffice(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {offices.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-200">Reset Password (optional)</label>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => {
                  setEditingUser(null);
                  setResetPassword('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUserRole}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {auditApp && (
        <AuditTrailModal
          isOpen={!!auditApp}
          onClose={() => setAuditApp(null)}
          historyLogs={praiseService.getAuditLogsForApplication(auditApp.id)}
          applicationNumber={auditApp.application_number}
          nomineeName={auditApp.nominee_name}
        />
      )}

      <ConfirmationModal
        isOpen={confirmationRequest !== null}
        title={confirmationRequest?.title || ''}
        message={confirmationRequest?.message || ''}
        confirmLabel={confirmationRequest?.confirmLabel || 'Confirm'}
        isConfirming={isSaving}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmationRequest(null)}
      />
    </div>
  );
};
