import React from 'react';
import { InAppNotification } from '../../types';
import { Bell, Check, ExternalLink } from 'lucide-react';

interface NotificationDropdownProps {
  notifications: InAppNotification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNavigateToTab?: (tab: string, appId?: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  isOpen,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigateToTab
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div
      id="notification-dropdown"
      className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</h3>
          {unreadCount > 0 && (
            <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-semibold px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            id="mark-all-read-btn"
            onClick={onMarkAllAsRead}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Check size={13} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <Bell size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">System updates and workflow alerts will appear here</p>
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              id={`notif-item-${notif.id}`}
              className={`p-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                !notif.is_read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className={`text-xs font-bold ${!notif.is_read ? 'text-blue-900 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                  {notif.title}
                </h4>
                {!notif.is_read && (
                  <button
                    onClick={() => onMarkAsRead(notif.id)}
                    title="Mark as read"
                    className="text-slate-400 hover:text-blue-600 text-xs p-1"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {notif.message}
              </p>
              <div className="flex items-center justify-between mt-2 pt-1">
                <span className="text-[11px] text-slate-400">
                  {new Date(notif.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {notif.link_tab && (
                  <button
                    onClick={() => {
                      onMarkAsRead(notif.id);
                      if (onNavigateToTab) onNavigateToTab(notif.link_tab!, notif.application_id);
                      onClose();
                    }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <span>View Task</span>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 text-center">
        <button
          onClick={onClose}
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium py-1 px-4 cursor-pointer"
        >
          Close Tray
        </button>
      </div>
    </div>
  );
};
