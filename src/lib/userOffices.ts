import { UserProfile } from '../types';

export const assignedOfficeIds = (user: UserProfile): string[] =>
  user.office_ids ?? (user.office_id ? [user.office_id] : []);

export const hasAssignedOffice = (user: UserProfile, officeId: string): boolean =>
  Boolean(officeId) && assignedOfficeIds(user).includes(officeId);
