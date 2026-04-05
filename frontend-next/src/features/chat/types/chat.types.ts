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