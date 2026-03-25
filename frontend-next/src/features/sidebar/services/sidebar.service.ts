import type { SidebarPlan } from "../types/sidebar.types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function fetchUserPlans(
  userId: number | string,
): Promise<SidebarPlan[]> {
  const response = await fetch(`${API_BASE_URL}/plans?user_id=${userId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch plans");
  }

  return (await response.json()) as SidebarPlan[];
}

export async function fetchFullPlan(
  userId: number | string,
  plan: SidebarPlan,
): Promise<Record<string, unknown>> {
  const url =
    plan.mode === "multi"
      ? `${API_BASE_URL}/plans/multi/${plan.id}?user_id=${userId}`
      : `${API_BASE_URL}/plans/${plan.id}?user_id=${userId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to load plan");
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function deleteUserPlan(
  userId: number | string,
  planId: number | string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/plans/${planId}?user_id=${userId}`,
    {
      method: "DELETE",
    },
  );

  // 200, 204 = deleted. 404 = already gone — both are fine.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
}