import type {
  CourseCatalogItem,
  PlanSummary,
  SaveMultiPlanResult,
} from "../types/plan.types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function fetchCourseCatalog(): Promise<CourseCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/schedule/get_courses`);

  if (!response.ok) {
    throw new Error("Failed to fetch course catalog");
  }

  return (await response.json()) as CourseCatalogItem[];
}

export async function fetchSavedPlans(
  userId: number | string,
): Promise<PlanSummary[]> {
  const response = await fetch(`${API_BASE_URL}/plans?user_id=${userId}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as PlanSummary[];
}

export async function fetchSavedPlanDetail(
  userId: number | string,
  plan: PlanSummary,
): Promise<Record<string, unknown>> {
  const url =
    plan.mode === "multi"
      ? `${API_BASE_URL}/plans/multi/${plan.id}?user_id=${userId}`
      : `${API_BASE_URL}/plans/${plan.id}?user_id=${userId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function deleteSavedPlan(
  userId: number | string,
  planId: number | string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/plans/${planId}?user_id=${userId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export interface SaveMultiPlanPayload {
  user_id: number | string;
  name: string;
  semesters: Array<{
    term_season: string;
    term_year: number;
    courses: unknown[];
  }>;
}

export async function updatePlanName(
  planId: number | string,
  userId: number | string,
  name: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/plans/${planId}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      name,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function saveOrUpdateMultiPlan(
  planId: number | string | null,
  payload: SaveMultiPlanPayload,
): Promise<SaveMultiPlanResult> {
  const url = planId
    ? `${API_BASE_URL}/plans/multi/${planId}`
    : `${API_BASE_URL}/plans/multi`;

  const method = planId ? "PUT" : "POST";

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as SaveMultiPlanResult;
}

export async function fetchMultiPlanDetail(
  userId: number | string,
  planId: number | string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${API_BASE_URL}/plans/multi/${planId}?user_id=${userId}`,
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as Record<string, unknown>;
}