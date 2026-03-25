import type { ChatMessage } from "@/features/chat/types/chat.types";

export type PlanSelectionMode = "saved" | "single" | "multi";
export type PlanFilterMode = "all" | "single" | "multi";

export interface BasicUser {
  id?: number | string;
  username?: string;
  role?: string;
}

export interface PlanSelectionProps {
  onSelectPlan: (planType: PlanSelectionMode) => void;
  userData?: BasicUser | null;
  onLogout?: () => void;
}

export interface CourseCatalogItem {
  department?: string;
  course_code?: string | number;
  credits?: number | string;
}

export interface ScheduleItem {
  class_?: string;
  class_name?: string;
  [key: string]: unknown;
}

export interface PlanSummary {
  id: number | string;
  name: string;
  mode: string;
  term_season?: string;
  term_year?: string | number;
  total_credits?: number;
  total_courses?: number;
  semester_count?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SinglePlanDetail {
  schedule?: ScheduleItem[];
  [key: string]: unknown;
}

export interface SemesterDetail {
  schedule?: ScheduleItem[];
  [key: string]: unknown;
}

export interface MultiPlanDetail {
  semesters?: SemesterDetail[];
  [key: string]: unknown;
}

export interface SavedPlansUIProps {
  userData: BasicUser | null;
  onLogout?: () => void;
  onBack?: () => void;
  onSelectPlan: (plan: Record<string, unknown>) => void;
  onPlanDeleted?: () => void;
  refreshKey: number;
}

export interface BackendSemester {
  id?: number | string;
  term_season: string;
  term_year: number;
  total_credits?: number;
  credits?: number;
  total_courses?: number;
  courses?: ScheduleItem[];
  messages?: ChatMessage[];
  schedule?: ScheduleItem[];
}

export interface MultiPlanRecord extends PlanSummary {
  semesters?: BackendSemester[];
}

export interface SemesterUI {
  id: number;
  name: string;
  year: number;
  term: string;
  credits: number;
  total_credits?: number;
  total_courses?: number;
  courses: ScheduleItem[];
  plan_id?: number | string | null;
  semester_db_id?: number | string | null;
  messages?: ChatMessage[];
  schedule: ScheduleItem[];
}

export interface SemesterSelectionPayload extends SemesterUI {
  _planTitle: string;
  _allSemesters: SemesterUI[];
  _existingPlanId?: number | string | null;
}

export interface MultiSemesterUIProps {
  userData: BasicUser | null;
  onLogout?: () => void;
  onSelectSemester: (semester: SemesterSelectionPayload) => void;
  savedPlan?: MultiPlanRecord | null;
  onPlanSaved?: () => void;
  onPlanCreated?: (data: Record<string, unknown>) => void;
  onPlanIdSaved?: (planId: number | string) => void;
  initialTitle?: string;
  onTitleChange?: (title: string) => void;
  planId?: number | string | null;
}

export interface SaveMultiPlanResult {
  id: number | string;
  [key: string]: unknown;
}