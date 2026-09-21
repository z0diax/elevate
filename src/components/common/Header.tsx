import React, { useState } from 'react';
import { InAppNotification, UserProfile, UserRole } from '../../types';
import {
  Bell,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';

interface HeaderProps {
  currentUser: UserProfile;
  currentTab?: string;
  notifications: InAppNotification[];
  onMarkNotificationRead: (id: string) => void | Promise<void>;
  onMarkAllNotificationsRead: () => void | Promise<void>;
  onToggleSidebar: () => void;
  onNavigateToTab: (tab: string, appId?: string) => void;
  onLogout: () => void | Promise<void>;
}

const roleStyles: Record<UserRole, string> = {
  ADMINISTRATOR: 'bg-rose-50 text-rose-700 border-rose-200',
  SECRETARIAT: 'bg-teal-50 text-teal-700 border-teal-200',
  HEAD_OF_OFFICE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  EVALUATOR: 'bg-blue-50 text-blue-700 border-blue-200',
  NOMINEE: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  currentTab = 'dashboard',
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onToggleSidebar,
  onNavigateToTab,
  onLogout,
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const unreadNotifs = notifications.filter(notification => !notification.is_read).length;

  const getBreadcrumbTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard':
      case 'all-applications':
        return { section: 'Dashboard', page: 'Application Overview' };
      case 'secretariat-workbench':
      case 'verification':
        return { section: 'Secretariat', page: 'Document Verification' };
      case 'endorsements':
        return { section: 'Department', page: 'Office Endorsements' };
      case 'evaluator-queue':
        return { section: 'Assessment', page: 'Evaluator Score Matrix' };
      case 'deliberation':
        return { section: 'PRAISE Committee', page: 'Ranking & Deliberations' };
      case 'my-applications':
        return { section: 'Portal', page: 'My Nominations' };
      case 'new-nomination':
        return { section: 'Intake', page: 'New Nomination Form' };
      case 'awards-management':
        return { section: 'Configuration', page: 'Manage Awards & Criteria' };
      case 'offices-management':
        return { section: 'Configuration', page: 'Offices & Departments' };
      case 'users-management':
        return { section: 'Configuration', page: 'User Access Control' };
      case 'reports':
        return { section: 'Reports', page: 'Deliberation & Certificates' };
      case 'certificate-template':
        return { section: 'Reports', page: 'Certificate Template' };
      case 'audit-logs':
        return { section: 'Security', page: 'System Audit Logs' };
      default:
        return { section: 'Dashboard', page: 'Application Overview' };
    }
  };

  const breadcrumbs = getBreadcrumbTitle(currentTab);

  return (
    <header className="sticky top-0 z-40 h-14 sm:h-16 bg-white border-b border-slate-200 flex items-center justify-between gap-2 px-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4 text-xs sm:text-sm">
        <button
          id="mobile-sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <Menu size={20} />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden text-slate-400 font-normal sm:inline">{breadcrumbs.section}</span>
          <span className="hidden text-slate-300 sm:inline">/</span>
          <span className="max-w-[132px] truncate font-semibold text-slate-800 sm:max-w-none">{breadcrumbs.page}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
        <div className="relative hidden md:block">
          <input
            type="text"
            placeholder="Search reference no."
            value={globalSearch}
            onChange={event => setGlobalSearch(event.target.value)}
            className="pl-8 pr-3 py-1.5 bg-slate-100 border-none rounded-md text-xs w-48 sm:w-60 focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
          />
          <Search size={14} className="text-slate-400 absolute left-2.5 top-2" />
        </div>

        <button
          id="header-new-nomination-cta-btn"
          onClick={() => onNavigateToTab('new-nomination')}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 sm:px-4 sm:py-2 rounded-md text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New Nomination</span>
        </button>

        <div className="relative">
          <button
            id="header-notification-bell-btn"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-1.5 sm:p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Bell size={18} />
            {unreadNotifs > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadNotifs}
              </span>
            )}
          </button>

          <NotificationDropdown
            notifications={notifications}
            isOpen={isNotifOpen}
            onClose={() => setIsNotifOpen(false)}
            onMarkAsRead={onMarkNotificationRead}
            onMarkAllAsRead={onMarkAllNotificationsRead}
            onNavigateToTab={onNavigateToTab}
          />
        </div>

        <div className="relative">
          <button
            id="user-account-menu-btn"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {currentUser.full_name.charAt(0)}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[140px]">
                {currentUser.full_name}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {currentUser.role.replace(/_/g, ' ')}
              </p>
            </div>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden py-1">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{currentUser.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${roleStyles[currentUser.role]}`}>
                    {currentUser.role.replace(/_/g, ' ')}
                  </span>
                </div>

                {(currentUser.position_title || currentUser.office_name) && (
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-blue-600 shrink-0" />
                    <span className="truncate">
                      {[currentUser.position_title, currentUser.office_name].filter(Boolean).join(' • ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-2">
                <button
                  id="logout-btn"
                  onClick={async () => {
                    setIsUserMenuOpen(false);
                    await onLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-2 cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
