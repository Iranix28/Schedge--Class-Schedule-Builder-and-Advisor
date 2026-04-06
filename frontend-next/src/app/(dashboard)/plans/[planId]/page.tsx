"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import ChatUI from "@/features/chat/components/ChatUI";
import MultiSemesterUI from "@/features/plans/components/MultiSemesterUI";
import InlinePageLoader from "@/components/feedback/InlinePageLoader";

import {
  fetchFullPlan,
  fetchUserPlans,
} from "@/features/sidebar/services/sidebar.service";
import type {
  MultiPlanRecord,
  SemesterSelectionPayload,
} from "@/features/plans/types/plan.types";
import type { ChatSavedPlan } from "@/features/chat/types/chat.types";

type LoadedPlan = ChatSavedPlan &
  Partial<MultiPlanRecord> & {
    mode?: string;
    name?: string;
    id?: number | string;
    semesters?: unknown[];
  };

export default function PlanDetailPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const { userData, onLogout, refreshSidebar } = useDashboardShell();

  const planId = params.planId;

  const [loadedPlan, setLoadedPlan] = useState<LoadedPlan | null>(null);
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

      const fullPlan = (await fetchFullPlan(userId, summaryPlan)) as LoadedPlan;
      setLoadedPlan(fullPlan);
      setPlanTitle(fullPlan.name || "");
    } catch (error) {
      console.error("Failed to load plan:", error);
      setLoadedPlan(null);
      setLoadError("Could not load plan.");
    } finally {
      setIsLoading(false);
    }
  }, [userData?.id, planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const isMultiPlan = useMemo(() => {
    if (!loadedPlan) return false;
    return loadedPlan.mode === "multi" || Array.isArray(loadedPlan.semesters);
  }, [loadedPlan]);

  const handleRefresh = useCallback(() => {
    refreshSidebar();
    void loadPlan();
  }, [refreshSidebar, loadPlan]);

  const handleSelectSemester = useCallback(
    (semester: SemesterSelectionPayload) => {
      const semesterId = semester.semester_db_id ?? semester.id;

      if (semesterId === undefined || semesterId === null) return;

      router.push(`/plans/${planId}/semester/${String(semesterId)}`);
    },
    [router, planId],
  );

  if (isLoading) {
    return <InlinePageLoader message="Loading plan..." />;
  }

  if (loadError || !loadedPlan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-slate-700">{loadError || "Plan not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/plans/saved")}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Back to Saved Plans
        </button>
      </div>
    );
  }

  if (isMultiPlan) {
    return (
      <MultiSemesterUI
        key={`saved-multi-${String(loadedPlan.id ?? planId)}`}
        userData={userData}
        onLogout={onLogout}
        onSelectSemester={handleSelectSemester}
        savedPlan={loadedPlan as MultiPlanRecord}
        onPlanSaved={async () => {}}
        onPlanCreated={async () => {}}
        initialTitle={planTitle || loadedPlan.name || ""}
        onTitleChange={setPlanTitle}
        planId={(loadedPlan.id ?? planId) as number | string}
      />
    );
  }

  return (
    <ChatUI
      key={`saved-single-${String(loadedPlan.id ?? planId)}`}
      userData={userData}
      onLogout={onLogout}
      onBack={() => router.push("/plans/saved")}
      savedPlan={loadedPlan as ChatSavedPlan}
      onPlanSaved={handleRefresh}
    />
  );
}
