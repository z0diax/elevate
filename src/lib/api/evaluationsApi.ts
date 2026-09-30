import { apiRequest } from './client';
import { loadApplications, loadAuditLogs } from './state';
import { EvaluationRevision } from '../../types';

export const evaluationsApi = {
  async getRevisionHistory(evaluationId: string): Promise<EvaluationRevision[]> {
    return apiRequest<EvaluationRevision[]>(`evaluations.php?action=history&evaluation_id=${encodeURIComponent(evaluationId)}`);
  },

  async reviseEvaluation(payload: { application_id: string; evaluation_id: string; expected_version: number; revision_reason: string; scores: Array<{ criterion_id: string; score: number; remarks: string }>; general_remarks: string }): Promise<void> {
    await apiRequest('evaluations.php?action=revise', { method: 'POST', body: JSON.stringify(payload) });
    await loadApplications();
    await loadAuditLogs();
  },
  async startEvaluation(applicationId: string): Promise<void> {
    await apiRequest('evaluations.php?action=start', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId }),
    });
    await loadApplications();
  },

  async submitEvaluation(payload: {
    application_id: string;
    evaluator_id?: string;
    evaluator_name?: string;
    evaluator_position?: string;
    scores: Array<{
      criterion_id: string;
      criterion_name?: string;
      weight_percentage?: number;
      max_score?: number;
      raw_score?: number;
      score?: number;
      weighted_score?: number;
      remarks?: string;
      evaluator_remarks?: string;
    }>;
    general_remarks: string;
  }): Promise<void> {
    await apiRequest('evaluations.php', {
      method: 'POST',
      body: JSON.stringify({
        application_id: payload.application_id,
        general_remarks: payload.general_remarks,
        scores: payload.scores.map(score => ({ criterion_id: score.criterion_id, score: score.score ?? score.raw_score, remarks: score.remarks ?? score.evaluator_remarks ?? '' })),
      }),
    });
    await loadApplications();
    await loadAuditLogs();
  },
};
