import { Award, Office, UserProfile } from '../../types';
import { apiRequest } from './client';
import { normalizeAward, normalizeOffice } from './normalizers';
import { loadApplications, loadAwards, loadOffices, loadUsers, state } from './state';

export const catalogApi = {
  getOffices(): Office[] {
    return [...state.cachedOffices];
  },

  async createOffice(office: Omit<Office, 'id'>): Promise<Office> {
    const createdOffice = normalizeOffice(await apiRequest<any>('offices.php', {
      method: 'POST',
      body: JSON.stringify(office),
    }));
    await loadOffices();
    return createdOffice;
  },

  async updateOffice(id: string, office: Omit<Office, 'id'>): Promise<Office> {
    const updatedOffice = normalizeOffice(await apiRequest<any>('offices.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...office }),
    }));
    await loadOffices();
    await loadUsers();
    await loadApplications();
    return updatedOffice;
  },

  async deleteOffice(id: string): Promise<void> {
    await apiRequest('offices.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadOffices();
  },

  getAwards(): Award[] {
    return [...state.cachedAwards];
  },

  async getAwardEvaluationRoute(awardId: string) {
    return apiRequest<import('../../types').AwardEvaluationRoute | null>(`award_routes.php?award_id=${encodeURIComponent(awardId)}`);
  },

  async getAvailableEvaluators() {
    return apiRequest<Array<Pick<UserProfile, 'id' | 'full_name' | 'office_name'>>>('award_routes.php?action=evaluators');
  },

  async saveAwardEvaluationRoute(awardId: string, requiredEvaluators: number, evaluatorIds: string[], isActive: boolean) {
    return apiRequest(`award_routes.php?award_id=${encodeURIComponent(awardId)}`, {
      method: 'PUT',
      body: JSON.stringify({ required_evaluators: requiredEvaluators, evaluator_ids: evaluatorIds, is_active: isActive }),
    });
  },

  getAwardById(id: string): Award | undefined {
    return state.cachedAwards.find(award => award.id === id);
  },

  async createAward(award: Omit<Award, 'id'>): Promise<Award> {
    const payload = {
      ...award,
      criteria: award.criteria?.map(({ criterion_name, criterion_description, weight_percentage, max_score }) => ({ criterion_name, criterion_description, weight_percentage, max_score })),
      document_requirements: award.document_requirements?.map(({ document_name, description, is_mandatory }) => ({ document_name, description, is_mandatory })),
      eligibility_requirements: award.eligibility_requirements?.map(({ requirement_description, is_mandatory, order_index }) => ({ requirement_description, is_mandatory, order_index })),
    };
    const createdAward = normalizeAward(await apiRequest<any>('awards.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
    await loadAwards();
    return createdAward;
  },

  async updateAward(id: string, updates: Partial<Award>): Promise<Award> {
    const payload = {
      ...updates,
      ...(updates.criteria && { criteria: updates.criteria.map(({ criterion_name, criterion_description, weight_percentage, max_score }) => ({ criterion_name, criterion_description, weight_percentage, max_score })) }),
      ...(updates.document_requirements && { document_requirements: updates.document_requirements.map(({ document_name, description, is_mandatory }) => ({ document_name, description, is_mandatory })) }),
      ...(updates.eligibility_requirements && { eligibility_requirements: updates.eligibility_requirements.map(({ requirement_description, is_mandatory, order_index }) => ({ requirement_description, is_mandatory, order_index })) }),
    };
    const updatedAward = normalizeAward(await apiRequest<any>('awards.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...payload }),
    }));
    await loadAwards();
    return updatedAward;
  },

  async deleteAward(id: string): Promise<void> {
    await apiRequest('awards.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadAwards();
  },
};
