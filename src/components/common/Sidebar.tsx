import React from 'react';
import { UserProfile, UserRole } from '../../types';
import { 
  LayoutDashboard, 
  FilePlus, 
  FileCheck2, 
  UserCheck, 
  Scale, 
  Sparkles, 
  Award, 
  Building2, 
  Users, 
  FileBarChart, 
  History, 
  Search,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  currentUser?: UserProfile | null;
  counts: {
    pendingEndorsement: number;
    pendingVerification: number;
    pendingEvaluation: number;
    forDeliberation: number;
    myApplications: number;
  };
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  currentUser,
  counts,
  isOpen,
  onClose
}) => {
  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: number;
    roles: UserRole[];
    section?: string;
  }

  const navItems: NavItem[] = [
    // Primary Dashboards
    {
      id: 'dashboard',
      label: 'Admin Dashboard',
      icon: LayoutDashboard,
      roles: ['ADMINISTRATOR'],
      section: 'Main Menu'
    },
    {
      id: 'secretariat-workbench',
      label: 'Secretariat Desk',
      icon: LayoutDashboard,
      roles: ['SECRETARIAT'],
      section: 'Main Menu'
    },
    {
      id: 'endorsements',
      label: 'Office Endorsements',
      icon: UserCheck,
      badge: counts.pendingEndorsement,
      roles: ['HEAD_OF_OFFICE'],
      section: 'Main Menu'
    },
    {
      id: 'evaluator-queue',
      label: 'Evaluator Matrix',
      icon: Scale,
      badge: counts.pendingEvaluation,
      roles: ['EVALUATOR'],
      section: 'Main Menu'
    },
    {
      id: 'my-applications',
      label: 'My Nominations',
      icon: FolderOpen,
      badge: counts.myApplications,
      roles: ['NOMINEE'],
      section: 'Main Menu'
    },

    // Workflow Actions
    {
      id: 'new-nomination',
      label: 'Submit Nomination',
      icon: FilePlus,
      roles: ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'NOMINEE'],
      section: 'Applications'
    },
    {
      id: 'all-applications',
      label: 'All Applications',
      icon: Search,
      roles: ['ADMINISTRATOR', 'SECRETARIAT'],
      section: 'Applications'
    },
    {
      id: 'verification',
      label: 'Document Verification',
      icon: FileCheck2,
      badge: counts.pendingVerification,
      roles: ['SECRETARIAT', 'ADMINISTRATOR'],
      section: 'Applications'
    },
    {
      id: 'deliberation',
      label: 'PRAISE Deliberation',
      icon: Sparkles,
      badge: counts.forDeliberation,
      roles: ['ADMINISTRATOR', 'SECRETARIAT'],
      section: 'Applications'
    },

    // Configuration & Admin
    {
      id: 'awards-management',
      label: 'Manage Awards',
      icon: Award,
      roles: ['ADMINISTRATOR'],
      section: 'System'
    },
    {
      id: 'offices-management',
      label: 'Offices & Depts',
      icon: Building2,
      roles: ['ADMINISTRATOR'],
      section: 'System'
    },
    {
      id: 'users-management',
      label: 'User Access',
      icon: Users,
      roles: ['ADMINISTRATOR'],
      section: 'System'
    },

    // Public / Reference / Reports
    {
      id: 'awards-catalog',
      label: 'Awards Guidelines',
      icon: Award,
      roles: ['HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE'],
      section: 'System'
    },
    {
      id: 'reports',
      label: 'Reports & Certificates',
      icon: FileBarChart,
      roles: ['ADMINISTRATOR', 'SECRETARIAT'],
      section: 'System'
    },
    {
      id: 'audit-logs',
      label: 'Audit Logs',
      icon: History,
      roles: ['ADMINISTRATOR', 'SECRETARIAT'],
      section: 'System'
    }
  ];

  // Filter items matching user role
  const visibleItems = navItems.filter(item => item.roles.includes(userRole));

  // Group by section preserving specified order
  const sectionOrder = ['Main Menu', 'Applications', 'System'];
  const sections = sectionOrder.filter(sec => visibleItems.some(item => (item.section || 'Main Menu') === sec));

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 text-slate-300 transition-transform duration-300 ${
          isOpen ? 'translate-x-0 lg:translate-x-0' : '-translate-x-full lg:-translate-x-full'
        } flex flex-col justify-between`}
      >
        {/* Brand Banner */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0">
            T
          </div>
          <div className="min-w-0">
            <h1 className="text-white text-xs font-bold tracking-widest uppercase truncate">Tacloban City</h1>
            <p className="text-blue-400 text-[10px] uppercase tracking-tighter font-semibold truncate">PRAISE Management</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {sections.map(section => {
            const sectionItems = visibleItems.filter(i => (i.section || 'Main Menu') === section);
            if (sectionItems.length === 0) return null;

            return (
              <div key={section} className="space-y-1">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5">
                  {section}
                </div>
                <div className="space-y-1">
                  {sectionItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id || (item.id === 'reports' && currentTab === 'certificate-template');

                    return (
                      <button
                        key={item.id}
                        id={`nav-tab-${item.id}`}
                        onClick={() => {
                          onSelectTab(item.id);
                          onClose();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-white text-blue-700'
                                : 'bg-slate-800 text-blue-400 border border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom User Card in Sidebar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white font-bold shrink-0">
              {currentUser?.full_name ? currentUser.full_name.charAt(0) : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">
                {currentUser?.full_name || 'Active User'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {currentUser?.role?.replace(/_/g, ' ') || 'Personnel'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
