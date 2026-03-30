import type {
  Course,
  SavedPlanIds,
  Section,
  VisualizationItem,
} from "../types/chat.types";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const REGISTRATION_URL =
  "https://www.stu.utah.edu/psc/heprod/EMPLOYEE/SA/c/NUI_FRAMEWORK.PT_AGSTARTPAGE_NUI.GBL?CONTEXTIDPARAMS=TEMPLATE_ID%3aPTPPNAVCOL&scname=HEUU_REGISTRATION&PTPPB_GROUPLET_ID=UUHE_REGISTRATION_TILE&CRefName=UUHE_REGISTRATION_TILE";

export async function sendMessageLLM(
  userText: string,
  onToken: (token: string) => void,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/ollama/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }

  const data = (await response.json()) as { reply: string };
  onToken(data.reply);
}

export async function uploadAuditFile(
  file: File,
): Promise<VisualizationItem[]> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/upload-audit/`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Schedule fetch failed");
  }

  return (await response.json()) as VisualizationItem[];
}

export async function fetchAllCoursesRequest(): Promise<Course[]> {
  const response = await fetch(`${BASE_URL}/schedule/get_courses`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch courses");
  }

  return (await response.json()) as Course[];
}

export async function fetchCourseSectionsRequest(
  classCode: string,
  department?: string,
): Promise<Section[]> {
  const url = department
    ? `${BASE_URL}/schedule/${classCode}?department=${encodeURIComponent(department)}`
    : `${BASE_URL}/schedule/${classCode}`;

  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;

    try {
      const errorBody = (await response.json()) as { detail?: string };
      detail = errorBody.detail || JSON.stringify(errorBody);
    } catch {
      detail = (await response.text()) || detail;
    }

    throw new Error(detail);
  }

  return (await response.json()) as Section[];
}

export async function createMultiPlanRequest(
  userId: number | string,
  name: string,
  semesters: Array<{
    term_season: string;
    term_year: number;
    courses: unknown[];
  }>,
): Promise<{ id: number | string }> {
  const response = await fetch(`${BASE_URL}/plans/multi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      name,
      semesters,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as { id: number | string };
}

export async function fetchMultiPlanDetailRequest(
  userId: number | string,
  planId: number | string,
): Promise<{
  semesters: Array<{ id?: number | string }>;
}> {
  const response = await fetch(
    `${BASE_URL}/plans/multi/${planId}?user_id=${userId}`,
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as {
    semesters: Array<{ id?: number | string }>;
  };
}

export async function createSemesterForPlanRequest(
  planId: number | string,
  userId: number | string,
  term: string,
  year: number,
): Promise<{ semester_db_id: number | string }> {
  const response = await fetch(`${BASE_URL}/plans/${planId}/semesters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      term_season: term,
      term_year: year,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as { semester_db_id: number | string };
}

export async function autosaveSemesterRequest(
  ids: SavedPlanIds,
  payload: {
    user_id: number | string;
    plan_name: string | null;
    courseSelections: Array<{
      course_id: number | string;
      class_section_id: number | string | null;
    }>;
    messages: Array<{ role: string; content: string }>;
    schedule: Array<{
      class_: string;
      day: string;
      startTime: string;
      endTime: string;
      room: string;
      course_id: number | string | null;
      class_section_id: number | string | null;
    }>;
  },
): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/plans/${ids.plan_id}/semesters/${ids.semester_db_id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function saveSinglePlanRequest(payload: {
  user_id: number | string;
  name: string;
  semester: {
    term_season: string;
    term_year: number;
  };
  courseSelections: Array<{
    course_id: number | string;
    class_section_id: number | string | null;
  }>;
  messages: Array<{ role: string; content: string }>;
  schedule: Array<{
    class_: string;
    day: string;
    startTime: string;
    endTime: string;
    room: string;
    course_id: number | string | null;
    class_section_id: number | string | null;
  }>;
}): Promise<{ id: number | string; semester_db_id: number | string }> {
  const response = await fetch(`${BASE_URL}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as {
    id: number | string;
    semester_db_id: number | string;
  };
}