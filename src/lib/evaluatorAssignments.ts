import { Application, ApplicationEvaluatorAssignment } from '../types';

export function getActiveEvaluatorAssignments(application: Application): ApplicationEvaluatorAssignment[] {
  return application.evaluator_assignments?.filter(assignment => assignment.status !== 'Reassigned') ?? [];
}

export function getAssignedEvaluatorIds(application: Application): string[] {
  const ids = Array.isArray(application.evaluator_assignments)
    ? getActiveEvaluatorAssignments(application).map(assignment => assignment.evaluator_id)
    : application.assigned_evaluators ?? [];
  return [...new Set(ids)];
}

export function isAssignedEvaluator(application: Application, userId: string): boolean {
  return getAssignedEvaluatorIds(application).includes(userId);
}

export function getEvaluatorAssignmentStatus(
  application: Application,
  userId: string,
): ApplicationEvaluatorAssignment['status'] | undefined {
  return application.evaluator_assignments?.find(assignment => assignment.evaluator_id === userId)?.status;
}

export function getEvaluatorProgress(application: Application): { assignedCount: number; completedCount: number } {
  const assignedIds = getAssignedEvaluatorIds(application);
  const completedIds = Array.isArray(application.evaluator_assignments)
    ? getActiveEvaluatorAssignments(application)
      .filter(assignment => assignment.status === 'Completed')
      .map(assignment => assignment.evaluator_id)
    : (application.evaluations ?? [])
      .filter(evaluation => evaluation.is_submitted)
      .map(evaluation => evaluation.evaluator_id);
  return {
    assignedCount: assignedIds.length,
    completedCount: new Set(completedIds.filter(id => assignedIds.includes(id))).size,
  };
}
