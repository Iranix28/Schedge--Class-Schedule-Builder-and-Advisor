export type ChatRole = "assistant" | "user";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface UploadedFileMeta {
  name: string;
  size: string;
  type: string;
}

export interface VisualizationItem {
  class_?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  instructor?: string | null;
  course_id?: number | string | null;
  class_section_id?: number | string | null;
  id?: number | string | null;

  section_code?: string | null;
  section_type?: string | null;
  parent_section_id?: number | string | null;

  [key: string]: unknown;
}

export interface VisualizationData {
  type: "schedule";
  data: VisualizationItem[];
}

export interface Course {
  id?: number | string;
  department: string;
  course_code: number | string;
  course_name: string;
  credits: number | string;
  description?: string;
}

export interface Section extends VisualizationItem {
  class_: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  instructor?: string | null;
  course_id?: number | string | null;
  class_section_id?: number | string | null;

  section_code?: string | null;
  section_type?: string | null;
  parent_section_id?: number | string | null;
}

export interface SavedPlanIds {
  plan_id: number | string;
  semester_db_id: number | string;
}

export interface ChatSavedPlan {
  id?: number | string;
  semester_db_id?: number | string;
  name?: string;
  messages?: ChatMessage[];
  schedule?: VisualizationItem[];
  term_season?: string;
  term_year?: number;
}

export interface ChatSemesterContext {
  id?: number | string;
  name?: string;
  plan_id?: number | string | null;
  semester_db_id?: number | string | null;
  term?: string;
  year?: number;
  term_season?: string;
  term_year?: number;
  messages?: ChatMessage[];
  schedule?: VisualizationItem[];
  _allSemesters?: Array<{
    id?: number | string;
    term: string;
    year: number;
    courses?: unknown[];
  }>;
  _existingPlanId?: number | string | null;
  _planTitle?: string;
}

export interface ChatUser {
  id?: number | string;
  username?: string;
  role?: string;
}

export interface BackNavigationPayload {
  messages: ChatMessage[];
  schedule: VisualizationItem[];
  planName: string | null;
}

export interface ChatUIProps {
  userData: ChatUser | null;
  onLogout?: () => void;
  onBack: (payload?: BackNavigationPayload) => void;
  savedPlan?: ChatSavedPlan | null;
  semester?: ChatSemesterContext | null;
  onPlanSaved?: (newPlanId?: number | string) => void;
  onPlanCreated?: (ids: SavedPlanIds) => void;
}

export type CourseGradeStats = {
  id: number | string;
  course_id: number | string;

  a_count: number;
  b_count: number;
  c_count: number;
  d_count: number;
  e_count: number;
  cr_count: number;
  nc_count: number;
  w_count: number;
  other_count: number;

  total_students: number;
  letter_graded_students: number;

  average_gpa: number | string | null;
  withdrawal_rate: number | string | null;
  completion_rate: number | string | null;
  failure_rate_letter_only: number | string | null;
  failure_rate_total: number | string | null;
  pass_rate_letter_only: number | string | null;
  pass_rate_total: number | string | null;
  a_rate: number | string | null;
  b_or_better_rate: number | string | null;
  c_or_better_rate: number | string | null;
  letter_graded_rate: number | string | null;
  nonstandard_grading_rate: number | string | null;
  other_rate: number | string | null;

  is_low_sample: boolean;
  has_letter_grades: boolean;
  has_nonstandard_grading: boolean;

  grade_distribution?: Record<string, number> | null;
};