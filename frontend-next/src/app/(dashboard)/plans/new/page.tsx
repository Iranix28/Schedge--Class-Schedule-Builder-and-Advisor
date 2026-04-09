"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import ChatUI from "@/features/chat/components/ChatUI";
import type { BackNavigationPayload } from "@/features/chat/types/chat.types";
import MultiSemesterUI from "@/features/plans/components/MultiSemesterUI";
import PlanSelection from "@/features/plans/components/PlanSelection";
import type { SemesterSelectionPayload, SemesterUI, MultiPlanRecord, BackendSemester } from "@/features/plans/types/plan.types";
import { fetchMultiPlanDetail } from "@/features/plans/services/plans.service";

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
  const [multiSemesters, setMultiSemesters] = useState<SemesterUI[]>([]);
  // Unique ID for each fresh multi-plan session — forces MultiSemesterUI to fully reset
  const [multiSessionId, setMultiSessionId] = useState(() => Date.now());
  const prevModeRef = useRef(mode);
  const createdMultiPlanIdRef = useRef<number | string | null>(null);

  const goToPlanSelection = useCallback(() => {
    setSelectedSemester(null);
    setCreatedMultiPlanId(null);
    createdMultiPlanIdRef.current = null;
    setMultiPlanTitle("");
    setSemesterChatKey("none");
    setMultiSemesters([]);
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
    async (_newPlanId?: number | string) => {
      refreshSidebar();
      // Use passed planId first, then ref — ref may not be set yet if onPlanCreated
      // hasn't fired (e.g. first autosave in createFreshMultiPlan)
      const planId = _newPlanId ?? createdMultiPlanIdRef.current;
      if (!planId || !userData?.id) return;
      // Keep ref in sync
      if (_newPlanId) createdMultiPlanIdRef.current = _newPlanId;
      try {
        const fullPlan = await fetchMultiPlanDetail(userData.id, planId) as MultiPlanRecord;
        if (!fullPlan?.semesters) return;
        const backendSemesters = fullPlan.semesters as BackendSemester[];

        // Replace multiSemesters wholesale from backend — avoids all id-matching edge cases
        const refreshed: SemesterUI[] = backendSemesters.map((s, idx) => ({
          id: idx + 1,
          name: `${s.term_season} ${s.term_year}`,
          year: s.term_year,
          term: s.term_season,
          credits: s.total_credits || 0,
          total_credits: s.total_credits || 0,
          total_courses: s.total_courses ?? (s.courses || []).length,
          courses: s.courses || [],
          schedule: s.schedule || [],
          messages: s.messages || [],
          semester_db_id: s.id,
          plan_id: planId,
        }));
        setMultiSemesters(refreshed);

        // Also refresh selectedSemester so re-entering the semester shows current data
        setSelectedSemester((prev) => {
          if (!prev) return prev;
          const match = backendSemesters.find(
            (s) => String(s.id) === String(prev.semester_db_id)
          );
          if (!match) return prev;
          return {
            ...prev,
            courses: match.courses || prev.courses,
            schedule: match.schedule || prev.schedule,
            messages: match.messages || prev.messages,
            total_courses: match.total_courses ?? prev.total_courses,
            total_credits: match.total_credits ?? prev.total_credits,
            semester_db_id: match.id ?? prev.semester_db_id,
          };
        });
      } catch (e) {
        console.warn("[NewPlanPage] failed to refresh semester data after save:", e);
      }
    },
    [refreshSidebar, userData?.id],
  );

  const handleMultiPlanIdSaved = useCallback(
    (planId: number | string) => {
      setCreatedMultiPlanId(planId);
      createdMultiPlanIdRef.current = planId;
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
      createdMultiPlanIdRef.current = ids.plan_id ?? null;

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

  // Reset all multi-plan state whenever navigating to multi mode from outside
  // (e.g. sidebar "New Multi-Semester Plan" button or home button)
  useEffect(() => {
    if (mode === "multi" && prevModeRef.current !== "multi") {
      setSelectedSemester(null);
      setCreatedMultiPlanId(null);
      createdMultiPlanIdRef.current = null;
      setMultiPlanTitle("");
      setSemesterChatKey("none");
      setMultiSemesters([]);
      setMultiSessionId(Date.now());
    }
    prevModeRef.current = mode;
  }, [mode]);

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
        key={`new-multi-${multiSessionId}`}
        userData={userData}
        onLogout={onLogout}
        onSelectSemester={handleSelectSemester}
        onPlanSaved={() => void handlePlanSaved()}
        onPlanCreated={handlePlanCreated}
        onPlanIdSaved={handleMultiPlanIdSaved}
        initialTitle={multiPlanTitle}
        onTitleChange={setMultiPlanTitle}
        planId={createdMultiPlanId}
        externalSemesters={multiSemesters.length > 0 ? multiSemesters : undefined}
        onSemestersChange={setMultiSemesters}
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