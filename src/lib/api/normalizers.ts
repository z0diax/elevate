import {
  Application, ApplicationDocument, ApplicationEvaluatorAssignment, ApplicationHistory,
  ApplicationStatus, Award, CertificateTemplateSettings, Evaluation,
  EvaluationCriterionScore, InAppNotification, Office, ProcessingStage,
  UserProfile, UserRole,
} from '../../types';
import { normalizeCertificateTemplateSettings } from '../certificateTemplate';
import { getAppBasePath, resolveProjectUrl } from '../mysqlService';

export function normalizeUser(user: any): UserProfile {
  return {
    id: String(user.id),
    email: String(user.email),
    full_name: String(user.full_name),
    role: user.role as UserRole,
    office_id: user.office_id || undefined,
    office_name: user.office_name || undefined,
    position_title: user.position_title || undefined,
    employee_id: user.employee_id || undefined,
    contact_number: user.contact_number || undefined,
    barangay: user.barangay || undefined,
    created_at: user.created_at || undefined,
    is_active: user.is_active === undefined ? true : Boolean(user.is_active),
    must_change_password: Boolean(user.must_change_password),
  };
}

export function normalizeOffice(office: any): Office {
  return {
    id: String(office.id),
    name: String(office.name),
    code: String(office.code),
    head_name: String(office.head_name),
    head_title: String(office.head_title),
    is_active: Boolean(office.is_active),
  };
}

export function normalizeCriterion(score: any): EvaluationCriterionScore {
  return {
    id: String(score.id),
    evaluation_id: String(score.evaluation_id),
    criterion_id: String(score.criterion_id),
    criterion_name: String(score.criterion_name),
    weight_percentage: Number(score.weight_percentage || 0),
    max_score: Number(score.max_score || 100),
    score: Number(score.score || 0),
    remarks: score.remarks || '',
  };
}

export function normalizeEvaluation(evaluation: any): Evaluation {
  const normalizedScores = Array.isArray(evaluation.scores) ? evaluation.scores.map(normalizeCriterion) : [];
  const normalized: Evaluation = {
    id: String(evaluation.id),
    application_id: String(evaluation.application_id),
    evaluator_id: String(evaluation.evaluator_id),
    evaluator_name: String(evaluation.evaluator_name),
    evaluator_office: evaluation.evaluator_office || undefined,
    total_raw_score: Number(evaluation.total_raw_score || 0),
    weighted_percentage: Number(evaluation.weighted_percentage || evaluation.total_score || 0),
    total_score: Number(evaluation.total_score || evaluation.weighted_percentage || 0),
    general_remarks: evaluation.general_remarks || '',
    is_submitted: Boolean(evaluation.is_submitted),
    version_number: Number(evaluation.version_number || 1),
    revision_count: Number(evaluation.revision_count || 0),
    submitted_at: evaluation.submitted_at || undefined,
    reopened_at: evaluation.reopened_at || undefined,
    reopened_by: evaluation.reopened_by || undefined,
    scores: normalizedScores,
  };

  normalizedScores.forEach((score, index) => {
    (normalized.scores[index] as any).raw_score = score.score;
    (normalized.scores[index] as any).evaluator_remarks = score.remarks || '';
    (normalized.scores[index] as any).weighted_score = Number((evaluation.scores?.[index]?.weighted_score ?? 0));
  });

  return normalized;
}

export function normalizeDocument(document: any): ApplicationDocument {
  return {
    id: String(document.id),
    application_id: String(document.application_id),
    requirement_id: document.requirement_id || undefined,
    document_name: String(document.document_name),
    file_url: document.file_url ? resolveProjectUrl(`api/documents.php?action=download&id=${encodeURIComponent(String(document.id))}`) : '',
    file_size: document.file_size !== null && document.file_size !== undefined ? Number(document.file_size) : undefined,
    file_type: document.file_type || undefined,
    status: document.status,
    verification_remarks: document.verification_remarks || undefined,
    verified_by: document.verified_by || undefined,
    verified_at: document.verified_at || undefined,
    uploaded_at: document.uploaded_at || new Date().toISOString(),
  };
}

export function normalizeAward(award: any): Award {
  return {
    id: String(award.id),
    name: String(award.name),
    code: String(award.code),
    description: award.description || '',
    remarks: award.remarks || '',
    award_year: Number(award.award_year || new Date().getFullYear()),
    min_qualifying_score: Number(award.min_qualifying_score ?? 85),
    is_on_the_spot: Boolean(award.is_on_the_spot),
    is_active: Boolean(award.is_active),
    criteria: Array.isArray(award.criteria)
      ? award.criteria.map((criterion: any) => ({
          id: String(criterion.id),
          award_id: String(criterion.award_id),
          criterion_name: String(criterion.criterion_name),
          criterion_description: criterion.criterion_description || '',
          weight_percentage: Number(criterion.weight_percentage || 0),
          max_score: Number(criterion.max_score || 100),
        }))
      : [],
    document_requirements: Array.isArray(award.document_requirements)
      ? award.document_requirements.map((document: any) => ({
          id: String(document.id),
          award_id: String(document.award_id),
          document_name: String(document.document_name),
          description: document.description || '',
          is_mandatory: Boolean(document.is_mandatory),
        }))
      : [],
    eligibility_requirements: Array.isArray(award.eligibility_requirements)
      ? award.eligibility_requirements.map((requirement: any) => ({
          id: String(requirement.id),
          award_id: String(requirement.award_id),
          requirement_description: String(requirement.requirement_description),
          is_mandatory: Boolean(requirement.is_mandatory),
          order_index: Number(requirement.order_index || 1),
        }))
      : [],
  };
}

export function normalizeApplication(application: any): Application {
  const normalized: Application = {
    id: String(application.id),
    application_number: String(application.application_number),
    award_id: String(application.award_id),
    award_name: application.award_name || undefined,
    award_year: Number(application.award_year || new Date().getFullYear()),
    nominee_id: application.nominee_id || undefined,
    nominee_name: String(application.nominee_name),
    employee_id: application.employee_id || undefined,
    position_title: String(application.position_title),
    office_id: String(application.office_id),
    office_name: String(application.office_name),
    division_section: application.division_section || undefined,
    employment_category: application.employment_category,
    contact_number: String(application.contact_number || ''),
    email: String(application.email || ''),
    barangay: application.barangay || undefined,
    nomination_type: application.nomination_type,
    nominator_id: String(application.nominator_id || ''),
    nominator_name: String(application.nominator_name || ''),
    nominator_position: String(application.nominator_position || ''),
    nominating_office: String(application.nominating_office || ''),
    justification: String(application.justification || ''),
    accomplishments: String(application.accomplishments || ''),
    supporting_narrative: String(application.supporting_narrative || ''),
    date_of_nomination: String(application.date_of_nomination || ''),
    status: application.status as ApplicationStatus,
    processing_stage: (application.processing_stage || application.stage || 'Submitted') as ProcessingStage,
    required_action: application.required_action || undefined,
    remarks: application.remarks || undefined,
    final_weighted_score: application.final_weighted_score !== null && application.final_weighted_score !== undefined
      ? Number(application.final_weighted_score)
      : undefined,
    deliberation_remarks: application.deliberation_remarks || undefined,
    deliberation_decision: application.deliberation_decision || undefined,
    deliberation_date: application.deliberation_date || undefined,
    award_date: application.award_date || undefined,
    created_at: application.created_at || new Date().toISOString(),
    updated_at: application.updated_at || new Date().toISOString(),
    documents: Array.isArray(application.documents) ? application.documents.map(normalizeDocument) : [],
    evaluations: Array.isArray(application.evaluations) ? application.evaluations.map(normalizeEvaluation) : [],
    evaluator_assignments: Array.isArray(application.evaluator_assignments)
      ? application.evaluator_assignments.map((assignment: ApplicationEvaluatorAssignment) => ({
          ...assignment,
          id: String(assignment.id),
          application_id: String(assignment.application_id),
          evaluator_id: String(assignment.evaluator_id),
          route_id: assignment.route_id == null ? null : String(assignment.route_id),
          sequence_no: Number(assignment.sequence_no),
          assigned_at: String(assignment.assigned_at),
          completed_at: assignment.completed_at == null ? null : String(assignment.completed_at),
        }))
      : undefined,
    endorsement: application.endorsement
      ? {
          id: String(application.endorsement.id),
          application_id: String(application.endorsement.application_id),
          endorsed_by: String(application.endorsement.endorsed_by),
          endorser_title: String(application.endorsement.endorser_title),
          decision: application.endorsement.decision,
          remarks: String(application.endorsement.remarks),
          created_at: String(application.endorsement.created_at),
        }
      : undefined,
  };

  (normalized as any).stage = normalized.processing_stage;
  return normalized;
}

export function normalizeAuditLog(log: any): ApplicationHistory {
  return {
    id: String(log.id),
    application_id: String(log.application_id),
    user_id: String(log.user_id || ''),
    user_name: String(log.user_name || 'System'),
    user_role: log.user_role as UserRole,
    action: String(log.action || ''),
    previous_status: log.previous_status || undefined,
    new_status: log.new_status as ApplicationStatus,
    remarks: log.remarks || undefined,
    created_at: String(log.created_at || new Date().toISOString()),
  };
}

export function normalizeNotification(notification: any): InAppNotification {
  return {
    id: String(notification.id),
    user_id: notification.user_id || undefined,
    target_role: notification.target_role || undefined,
    application_id: notification.application_id || undefined,
    application_number: notification.application_number || undefined,
    title: String(notification.title || ''),
    message: String(notification.message || ''),
    is_read: Boolean(notification.is_read),
    created_at: String(notification.created_at || new Date().toISOString()),
    link_tab: notification.link_tab || undefined,
  };
}

export function normalizeCertificateBackgroundUrl(pathOrUrl?: string | null): string {
  const normalized = String(pathOrUrl || '').trim();
  return normalized ? resolveProjectUrl(normalized) : '';
}

export function stripProjectBasePath(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/{2,}/g, '/');
  const basePath = getAppBasePath();

  if (basePath && normalizedPathname === basePath) {
    return '';
  }

  if (basePath && normalizedPathname.startsWith(`${basePath}/`)) {
    return normalizedPathname.slice(basePath.length + 1);
  }

  return normalizedPathname.replace(/^\/+/, '');
}

export function toProjectRelativePath(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();

  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      if (typeof window !== 'undefined' && parsedUrl.origin === window.location.origin) {
        return stripProjectBasePath(parsedUrl.pathname);
      }
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith('/')) {
    return stripProjectBasePath(trimmed);
  }

  return trimmed.replace(/^\/+/, '');
}

export function normalizeStoredCertificateTemplateSettings(settings: any): CertificateTemplateSettings {
  const normalized = normalizeCertificateTemplateSettings(settings);
  return {
    ...normalized,
    background_image_url: normalizeCertificateBackgroundUrl(normalized.background_image_url),
  };
}

