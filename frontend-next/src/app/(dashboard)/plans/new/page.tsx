"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import ChatUI from "@/features/chat/components/ChatUI";
import type { BackNavigationPayload } from "@/features/chat/types/chat.types";
import MultiSemesterUI from "@/features/plans/components/MultiSemesterUI";
import PlanSelection from "@/features/plans/components/PlanSelection";
import type { SemesterSelectionPayload } from "@/features/plans/types/plan.types";

export default function NewPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userData, onLogout, refreshSidebar } = useDashboardShell();

  const mode = searchParams.get("mode");
  const resetToken = searchParams.get("reset") ?? "0";

  const [selectedSemester, setSelectedSemester] =
    useState<SemesterSelectionPayload | null>(null);

  const [multiPlanTitle, setMultiPlanTitle] = useState("");
  const [createdMultiPlanId, setCreatedMultiPlanId] = useState<
    number | string | null
  >(null);
  const [semesterChatKey, setSemesterChatKey] = useState("none");

  const goToPlanSelection = useCallback(() => {
    setSelectedSemester(null);
    setCreatedMultiPlanId(null);
    setMultiPlanTitle("");
    setSemesterChatKey("none");
    router.push("/plans/new");
  }, [router]);

  const handleSelectPlan = useCallback(
    (planType: "saved" | "single" | "multi") => {
      if (planType === "saved") {
        router.push("/plans/saved");
        return;
      }

      if (planType === "single") {
        router.push("/plans/new?mode=single");
        return;
      }

      router.push("/plans/new?mode=multi");
    },
    [router],
  );

  const handlePlanSaved = useCallback(
    (_newPlanId?: number | string) => {
      refreshSidebar();
    },
    [refreshSidebar],
  );

  const handleMultiPlanIdSaved = useCallback(
    (planId: number | string) => {
      setCreatedMultiPlanId(planId);
      refreshSidebar();
    },
    [refreshSidebar],
  );

  const handleSelectSemester = useCallback(
    (semester: SemesterSelectionPayload) => {
      if (semester._planTitle) {
        setMultiPlanTitle(semester._planTitle);
      }

      const stableKey = `sem-${String(
        semester.semester_db_id || semester.id || Date.now(),
      )}`;

      setSemesterChatKey(stableKey);
      setSelectedSemester(semester);
    },
    [],
  );

  const handlePlanCreated = useCallback(
    (ids: { plan_id?: number | string; semester_db_id?: number | string }) => {
      if (!ids.plan_id) return;

      setCreatedMultiPlanId(ids.plan_id);

      setSelectedSemester((previous) =>
        previous
          ? {
              ...previous,
              plan_id: ids.plan_id,
              semester_db_id: ids.semester_db_id,
            }
          : previous,
      );

      refreshSidebar();
    },
    [refreshSidebar],
  );

  const handleBackToMultiSemester = useCallback(
    (payload?: BackNavigationPayload) => {
      const resolvedName = payload?.planName ?? multiPlanTitle;

      if (resolvedName && resolvedName.trim()) {
        setMultiPlanTitle(resolvedName);
      }

      setSelectedSemester(null);
    },
    [multiPlanTitle],
  );

  if (mode === "single") {
    return (
      <ChatUI
        key={`new-single-${resetToken}`}
        userData={userData}
        onLogout={onLogout}
        onBack={goToPlanSelection}
        onPlanSaved={handlePlanSaved}
      />
    );
  }

  if (mode === "multi" && selectedSemester) {
    return (
      <ChatUI
        key={semesterChatKey}
        userData={userData}
        onLogout={onLogout}
        semester={selectedSemester}
        onBack={handleBackToMultiSemester}
        onPlanSaved={handlePlanSaved}
        onPlanCreated={handlePlanCreated}
      />
    );
  }

  if (mode === "multi") {
    return (
      <MultiSemesterUI
        key={`new-multi-${String(createdMultiPlanId ?? "draft")}`}
        userData={userData}
        onLogout={onLogout}
        onSelectSemester={handleSelectSemester}
        onPlanSaved={() => handlePlanSaved()}
        onPlanCreated={handlePlanCreated}
        onPlanIdSaved={handleMultiPlanIdSaved}
        initialTitle={multiPlanTitle}
        onTitleChange={setMultiPlanTitle}
        planId={createdMultiPlanId}
      />
    );
  }

  return (
    <PlanSelection
      onSelectPlan={handleSelectPlan}
      userData={userData}
      onLogout={onLogout}
    />
  );
}
