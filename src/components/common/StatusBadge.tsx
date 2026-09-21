import React from 'react';
import { ApplicationStatus } from '../../types';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileCheck2, 
  UserCheck, 
  Award, 
  XCircle, 
  FileText,
  RotateCcw,
  Sparkles,
  Search,
  Scale
} from 'lucide-react';

interface StatusBadgeProps {
  status: ApplicationStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true
}) => {
  const getBadgeConfig = (st: ApplicationStatus) => {
    switch (st) {
      case 'Draft':
        return {
          bg: 'bg-slate-100',
          text: 'text-slate-600',
          border: 'border-slate-200',
          icon: FileText
        };
      case 'Submitted':
        return {
          bg: 'bg-sky-50',
          text: 'text-sky-700',
          border: 'border-sky-200',
          icon: Clock
        };
      case 'For Endorsement':
        return {
          bg: 'bg-slate-100',
          text: 'text-slate-600',
          border: 'border-slate-200',
          icon: UserCheck
        };
      case 'Endorsed':
        return {
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          icon: CheckCircle2
        };
      case 'Returned for Revision':
        return {
          bg: 'bg-red-50',
          text: 'text-red-700',
          border: 'border-red-200',
          icon: RotateCcw
        };
      case 'For Verification':
        return {
          bg: 'bg-amber-50',
          text: 'text-amber-700',
          border: 'border-amber-200',
          icon: Search
        };
      case 'Incomplete':
        return {
          bg: 'bg-red-50',
          text: 'text-red-700',
          border: 'border-red-200',
          icon: AlertCircle
        };
      case 'Verified':
        return {
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          icon: FileCheck2
        };
      case 'For Evaluation':
      case 'Under Evaluation':
        return {
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          icon: Scale
        };
      case 'Evaluation Completed':
        return {
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-200',
          icon: CheckCircle2
        };
      case 'For Deliberation':
        return {
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-200',
          icon: Sparkles
        };
      case 'Approved':
        return {
          bg: 'bg-green-50',
          text: 'text-green-700',
          border: 'border-green-200',
          icon: CheckCircle2
        };
      case 'Not Approved':
        return {
          bg: 'bg-red-50',
          text: 'text-red-700',
          border: 'border-red-200',
          icon: XCircle
        };
      case 'Awarded':
        return {
          bg: 'bg-green-50',
          text: 'text-green-700 font-bold',
          border: 'border-green-300',
          icon: Award
        };
      default:
        return {
          bg: 'bg-slate-100',
          text: 'text-slate-600',
          border: 'border-slate-200',
          icon: FileText
        };
    }
  };

  const config = getBadgeConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 font-semibold rounded',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-semibold rounded-md',
    lg: 'text-xs px-3 py-1.5 gap-2 font-bold rounded-md'
  };

  const iconSizes = {
    sm: 11,
    md: 13,
    lg: 15
  };

  return (
    <span
      id={`status-badge-${status.toLowerCase().replace(/\s+/g, '-')}`}
      className={`inline-flex items-center border whitespace-nowrap shadow-2xs ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon size={iconSizes[size]} className="shrink-0" />}
      <span>{status}</span>
    </span>
  );
};
