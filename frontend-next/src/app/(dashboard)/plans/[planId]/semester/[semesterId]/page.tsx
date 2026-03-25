"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import ChatUI from "@/features/chat/components/ChatUI";
import InlinePageLoader from "@/components/feedback/InlinePageLoader";
import {
  fetchFullPlan,
  fetchUserPlans,
} from "@/features/sidebar/services/sidebar.service";
import type {
  MultiPlanRecord,
  SemesterSelectionPayload,
} from "@/features/plans/types/plan.types";
import type { BackNavigationPayload } from "@/features/chat/types/chat.types";

type LoadedMultiPlan = Omit<Partial<MultiPlanRecord>, "semesters"> & {
  id?: number | string;
  name?: string;
  mode?: string;
  semesters?: Array<Record<string, unknown>>;
};

export default function SemesterPage() {
  const params = useParams<{ planId: string; semesterId: string }>();
  const router = useRouter();
  const { userData, onLogout, refreshSidebar } = useDashboardShell();

  const planId = params.planId;
  const semesterId = params.semesterId;

  const [loadedPlan, setLoadedPlan] = useState<LoadedMultiPlan | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadPlan = useCallback(async () => {
    if (!userData?.id || !planId) return;

    const userId = userData.id;

    try {
      setIsLoading(true);
      setLoadError("");

      const savedPlans = await fetchUserPlans(userId);
      const summaryPlan = savedPlans.find(
        (plan) => String(plan.id) === String(planId),
      );

      if (!summaryPlan) {
        setLoadedPlan(null);
        setLoadError("Plan not found.");
        return;
      }

      const fullPlan = (await fetchFullPlan(
        userId,
        summaryPlan,
      )) as LoadedMultiPlan;
      setLoadedPlan(fullPlan);
      setPlanTitle(fullPlan.name || "");
    } catch (error) {
      console.error("Failed to load semester plan:", error);
      setLoadedPlan(null);
      setLoadError("Could not load semester.");
    } finally {
      setIsLoading(false);
    }
  }, [userData?.id, planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const resolvedSemester = useMemo<SemesterSelectionPayload | null>(() => {
    if (!loadedPlan || !Array.isArray(loadedPlan.semesters)) return null;

    const semesters = loadedPlan.semesters as Array<Record<string, unknown>>;

    const mappedSemesters = semesters.map((semester) => {
      const mappedId = (semester["semester_db_id"] ??
        semester["id"] ??
        semester["semesterId"]) as number | string;

      const mappedTerm = String(
        semester["term"] ?? semester["term_season"] ?? semester["season"] ?? "",
      );

      const rawMappedYear = semester["year"] ?? semester["term_year"] ?? "";
      const mappedYear =
        typeof rawMappedYear === "number"
          ? rawMappedYear
          : Number(rawMappedYear || 0);

      const mappedName =
        semester["name"] ??
        (mappedTerm && mappedYear
          ? `${mappedTerm} ${mappedYear}`
          : `Semester ${String(mappedId)}`);

      return {
        ...(semester as Record<string, unknown>),
        id: mappedId,
        semester_db_id: mappedId,
        plan_id: (loadedPlan.id ?? planId) as number | string,
        name: String(mappedName),
        year: mappedYear,
        term: mappedTerm,
      };
    }) as unknown as SemesterSelectionPayload["_allSemesters"];

    const match = semesters.find((semester) => {
      const candidateId =
        semester["semester_db_id"] ?? semester["id"] ?? semester["semesterId"];

      return String(candidateId) === String(semesterId);
    });

    if (!match) return null;

    const candidateId = (match["semester_db_id"] ??
      match["id"] ??
      match["semesterId"]) as number | string;

    const term = String(
      match["term"] ?? match["term_season"] ?? match["season"] ?? "",
    );

    const rawYear = match["year"] ?? match["term_year"] ?? "";
    const year = typeof rawYear === "number" ? rawYear : Number(rawYear || 0);

    const fallbackName =
      term && year ? `${term} ${year}` : `Semester ${String(candidateId)}`;

    return {
      ...(match as Record<string, unknown>),
      id: candidateId,
      semester_db_id: candidateId,
      plan_id: (loadedPlan.id ?? planId) as number | string,
      name: String(match["name"] ?? fallbackName),
      year,
      term,
      _planTitle: planTitle || loadedPlan.name || "",
      _allSemesters: mappedSemesters,
    } as SemesterSelectionPayload;
  }, [loadedPlan, semesterId, planId, planTitle]);

  const handleRefresh = useCallback(() => {
    refreshSidebar();
    void loadPlan();
  }, [refreshSidebar, loadPlan]);

  const handleBack = useCallback(
    (payload?: BackNavigationPayload) => {
      const nextTitle = payload?.planName;

      if (nextTitle && nextTitle.trim()) {
        setPlanTitle(nextTitle);
      }

      router.push(`/plans/${planId}`);
    },
    [router, planId],
  );

  if (isLoading) {
    return <InlinePageLoader message="Loading semester..." />;
  }

  if (loadError || !loadedPlan || !resolvedSemester) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-slate-700">
          {loadError || "Semester not found for this plan."}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/plans/${planId}`)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Back to Plan
        </button>
      </div>
    );
  }

  return (
    <ChatUI
      key={`semester-${String(resolvedSemester.semester_db_id ?? semesterId)}`}
      userData={userData}
      onLogout={onLogout}
      semester={resolvedSemester}
      onBack={handleBack}
      onPlanSaved={handleRefresh}
      onPlanCreated={handleRefresh}
    />
  );
}
