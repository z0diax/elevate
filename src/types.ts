export type UserRole = 'ADMINISTRATOR' | 'SECRETARIAT' | 'HEAD_OF_OFFICE' | 'EVALUATOR' | 'NOMINEE';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  office_id?: string;
  office_name?: string;
  position_title?: string;
  employee_id?: string;
  contact_number?: string;
  barangay?: string;
  created_at?: string;
}

export interface Office {
  id: string;
  name: string;
  code: string;
  head_name: string;
  head_title: string;
  is_active: boolean;
}

export type ApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'For Endorsement'
  | 'Endorsed'
  | 'Returned for Revision'
  | 'For Verification'
  | 'Incomplete'
  | 'Verified'
  | 'For Evaluation'
  | 'Under Evaluation'
  | 'Evaluation Completed'
  | 'For Deliberation'
  | 'Approved'
  | 'Not Approved'
  | 'Awarded';

export type ProcessingStage =
  | 'Submitted'
  | 'Endorsement'
  | 'Document Verification'
  | 'Evaluation'
  | 'Deliberation'
  | 'Final Decision'
  | 'Awarded';

export interface AwardEligibilityRequirement {
  id: string;
  award_id: string;
  requirement_description: string;
  is_mandatory: boolean;
  order_index: number;
}

export interface AwardDocumentRequirement {
  id: string;
  award_id: string;
  document_name: string;
  description: string;
  is_mandatory: boolean;
}

export interface AwardCriterion {
  id: string;
  award_id: string;
  criterion_name: string;
  criterion_description: string;
  weight_percentage: number;
  max_score: number;
}

export interface Award {
  id: string;
  name: string;
  code: string;
  description: string;
  award_year: number;
  min_qualifying_score: number;
  is_active: boolean;
  eligibility_requirements?: AwardEligibilityRequirement[];
  document_requirements?: AwardDocumentRequirement[];
  criteria?: AwardCriterion[];
}

export type DocumentStatus = 'Not Submitted' | 'Submitted' | 'For Verification' | 'Verified' | 'Rejected' | 'Missing';

export interface ApplicationDocument {
  id: string;
  application_id: string;
  requirement_id?: string;
  document_name: string;
  file_url: string;
  file_size?: number;
  file_type?: string;
  status: DocumentStatus;
  verification_remarks?: string;
  verified_by?: string;
  verified_at?: string;
  uploaded_at: string;
}

export interface Application {
  id: string;
  application_number: string; // e.g. PRAISE-2026-00001
  award_id: string;
  award_name?: string;
  award_year: number;
  
  // Nominee Info
  nominee_id?: string;
  nominee_name: string;
  employee_id?: string;
  position_title: string;
  office_id: string;
  office_name: string;
  division_section?: string;
  employment_category: 'Permanent' | 'Casual' | 'Contractual' | 'Job Order' | 'Barangay Official' | 'Barangay Worker';
  contact_number: string;
  email: string;
  barangay?: string;

  // Nomination Details
  nomination_type: 'Individual' | 'Group / Team';
  nominator_id: string;
  nominator_name: string;
  nominator_position: string;
  nominating_office: string;
  justification: string;
  accomplishments: string;
  supporting_narrative: string;
  date_of_nomination: string;

  // State
  status: ApplicationStatus;
  processing_stage: ProcessingStage;
  stage?: ProcessingStage;
  required_action?: string;
  remarks?: string;

  // Weighted Evaluation summary
  final_weighted_score?: number;
  deliberation_remarks?: string;
  deliberation_decision?: 'Approved' | 'Not Approved';
  deliberation_date?: string;
  award_date?: string;

  created_at: string;
  updated_at: string;

  documents?: ApplicationDocument[];
  evaluations?: Evaluation[];
  assigned_evaluators?: string[];
  endorsement?: EndorsementRecord;
}

export interface EndorsementRecord {
  id: string;
  application_id: string;
  endorsed_by: string;
  endorser_title: string;
  decision: 'Endorsed' | 'Returned for Revision' | 'Rejected';
  remarks: string;
  created_at: string;
}

export interface EvaluationCriterionScore {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  criterion_name: string;
  weight_percentage: number;
  max_score: number;
  score: number;
  raw_score?: number;
  weighted_score?: number;
  remarks?: string;
  evaluator_remarks?: string;
}

export interface Evaluation {
  id: string;
  application_id: string;
  evaluator_id: string;
  evaluator_name: string;
  evaluator_office?: string;
  total_raw_score: number;
  weighted_percentage: number;
  total_score?: number;
  general_remarks: string;
  is_submitted: boolean;
  submitted_at?: string;
  reopened_at?: string;
  reopened_by?: string;
  scores: EvaluationCriterionScore[];
}

export interface ApplicationHistory {
  id: string;
  application_id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  action: string;
  previous_status?: ApplicationStatus;
  new_status: ApplicationStatus;
  remarks?: string;
  created_at: string;
}

export interface CertificateTemplateSettings {
  citation_text: string;
  conferment_text: string;
  left_signatory_name: string;
  left_signatory_title: string;
  center_signatory_name: string;
  center_signatory_title: string;
  right_signatory_name: string;
  right_signatory_title: string;
  background_image_url?: string;
  updated_at?: string;
}

export interface InAppNotification {
  id: string;
  user_id?: string; // or target role
  target_role?: UserRole | 'ALL';
  application_id?: string;
  application_number?: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  link_tab?: string;
}

export interface FilterOptions {
  searchTerm: string;
  awardId: string;
  officeId: string;
  barangay: string;
  status: string;
  year: number | 'ALL';
}
