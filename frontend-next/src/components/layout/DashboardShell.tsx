"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUser,
  logoutUser,
} from "@/features/auth/services/auth.service";
import Sidebar from "@/features/sidebar/components/Sidebar";
import PlanSelection from "@/features/plans/components/PlanSelection";
import SavedPlansUI from "@/features/plans/components/SavedPlansUI";
import MultiSemesterUI from "@/features/plans/components/MultiSemesterUI";
import ChatUI from "@/features/chat/components/ChatUI";
import {
  fetchMultiPlanDetail,
  fetchSavedPlans,
} from "@/features/plans/services/plans.service";
import type {
  MultiPlanRecord,
  SemesterSelectionPayload,
} from "@/features/plans/types/plan.types";
import type {
  BackNavigationPayload,
  ChatSavedPlan,
} from "@/features/chat/types/chat.types";

type SelectedPlanMode = null | "saved" | "saved-multi" | "single" | "multi";

interface DashboardUser {
  id: number | string;
  username?: string;
  role?: string;
}

export default function DashboardShell() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<DashboardUser | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<SelectedPlanMode>(null);

  const [selectedSavedSinglePlan, setSelectedSavedSinglePlan] =
    useState<ChatSavedPlan | null>(null);

  const [selectedSavedMultiPlan, setSelectedSavedMultiPlan] =
    useState<MultiPlanRecord | null>(null);

  const [selectedSemester, setSelectedSemester] =
    useState<SemesterSelectionPayload | null>(null);

  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);

  const [multiPlanTitle, setMultiPlanTitle] = useState("");
  const [createdMultiPlanId, setCreatedMultiPlanId] = useState<
    number | string | null
  >(null);
  const [activeSinglePlanId, setActiveSinglePlanId] = useState<
    number | string | null
  >(null);
  const [semesterChatKey, setSemesterChatKey] = useState("none");

  // ── default plan name numbering ───────────────────────────────────
  const [nextSingleNum, setNextSingleNum] = useState(1);
  const [nextMultiNum, setNextMultiNum] = useState(1);

  const refreshDefaultNumbers = useCallback(async () => {
    if (!userData?.id) return;

    try {
      const plans = await fetchSavedPlans(userData.id);

      let maxSingle = 0;
      let maxMulti = 0;

      plans.forEach((plan) => {
        const singleMatch = plan.name.match(/^Single\s+(\d+)$/i);
        const multiMatch = plan.name.match(/^Multi\s+(\d+)$/i);

        if (singleMatch) {
          maxSingle = Math.max(maxSingle, parseInt(singleMatch[1], 10));
        }

        if (multiMatch) {
          maxMulti = Math.max(maxMulti, parseInt(multiMatch[1], 10));
        }
      });

      setNextSingleNum(maxSingle + 1);
      setNextMultiNum(maxMulti + 1);
    } catch (error) {
      console.warn(
        "[DashboardShell] failed to refresh default numbers:",
        error,
      );
    }
  }, [userData?.id]);

  useEffect(() => {
    void refreshDefaultNumbers();
  }, [refreshDefaultNumbers, sidebarRefreshKey]);

  // ── auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        setUserData({
          id: user.id,
          username: user.username,
          role: user.role,
        });
        setIsAuthenticated(true);
      } catch {
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore logout failure
    }

    setIsAuthenticated(false);
    setUserData(null);
    router.replace("/login");
  };

  // ── plan saved callback ───────────────────────────────────────────
  const handlePlanSaved = (newPlanId?: number | string) => {
    if (newPlanId) {
      setActiveSinglePlanId(newPlanId);
    }

    setSidebarRefreshKey((current) => current + 1);
  };

  // ── helpers to fully reset multi-plan navigation state ────────────
  const resetMultiState = () => {
    setSelectedSemester(null);
    setCreatedMultiPlanId(null);
    setMultiPlanTitle("");
    setSemesterChatKey("none");
  };

  // ── navigation handlers ────────────────────────────────────────────
  const handleSelectPlanType = (planType: "saved" | "single" | "multi") => {
    setSelectedPlan(planType);
  };

  const handleSelectSavedPlan = (plan: Record<string, unknown>) => {
    const typedPlan = plan as ChatSavedPlan &
      Partial<MultiPlanRecord> & { mode?: string };

    resetMultiState();

    if (typedPlan.mode === "multi" || Array.isArray(typedPlan.semesters)) {
      setSelectedSavedMultiPlan(typedPlan as MultiPlanRecord);
      setSelectedSavedSinglePlan(null);
      setSelectedPlan("saved-multi");
    } else {
      setSelectedSavedSinglePlan(typedPlan as ChatSavedPlan);
      setSelectedSavedMultiPlan(null);
      setSelectedPlan("saved");
    }
  };

  const handleBackToSavedPlans = (_payload?: BackNavigationPayload) => {
    setSelectedSavedSinglePlan(null);
  };

  const handleMultiPlanIdSaved = (planId: number | string) => {
    setCreatedMultiPlanId(planId);
    setSidebarRefreshKey((current) => current + 1);
  };

  const handleSelectSemester = (semester: SemesterSelectionPayload) => {
    if (semester._planTitle) {
      setMultiPlanTitle(semester._planTitle);
    }

    const stableKey = `sem-${String(
      semester.semester_db_id || semester.id || Date.now(),
    )}`;

    setSemesterChatKey(stableKey);
    setSelectedSemester(semester);
  };

  const handlePlanCreated = async (ids: {
    plan_id?: number | string;
    semester_db_id?: number | string;
  }) => {
    if (!ids.plan_id || !userData?.id) return;

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

    setSidebarRefreshKey((current) => current + 1);

    try {
      const fullPlan = await fetchMultiPlanDetail(userData.id, ids.plan_id);
      setSelectedSavedMultiPlan(fullPlan as MultiPlanRecord);
    } catch (error) {
      console.error("[handlePlanCreated] failed to fetch full plan:", error);
    }
  };

  const handleBackToMultiSemester = async (payload?: BackNavigationPayload) => {
    const resolvedName = payload?.planName ?? multiPlanTitle;

    if (resolvedName && resolvedName.trim()) {
      setMultiPlanTitle(resolvedName);
    }

    if (createdMultiPlanId && selectedPlan === "multi" && userData?.id) {
      try {
        const fullPlan = await fetchMultiPlanDetail(
          userData.id,
          createdMultiPlanId,
        );
        setSelectedSavedMultiPlan(fullPlan as MultiPlanRecord);
        setSelectedPlan("saved-multi");
      } catch (error) {
        console.error(
          "[handleBackToMultiSemester] failed to fetch plan:",
          error,
        );
      }
    } else if (selectedSavedMultiPlan?.id && userData?.id) {
      try {
        const fullPlan = await fetchMultiPlanDetail(
          userData.id,
          selectedSavedMultiPlan.id,
        );
        setSelectedSavedMultiPlan(fullPlan as MultiPlanRecord);
      } catch (error) {
        console.error(
          "[handleBackToMultiSemester] failed to re-fetch plan:",
          error,
        );
      }
    }

    setSelectedSemester(null);
  };

  const handleSidebarNavigate = (mode: string | null) => {
    setSelectedSavedSinglePlan(null);
    setSelectedSavedMultiPlan(null);
    setActiveSinglePlanId(null);
    resetMultiState();
    setSelectedPlan(mode as SelectedPlanMode);
    setResetKey((current) => current + 1);
  };

  const handleBackToPlanSelection = (_payload?: BackNavigationPayload) => {
    setSelectedPlan(null);
    setSelectedSavedSinglePlan(null);
    setSelectedSavedMultiPlan(null);
    setActiveSinglePlanId(null);
    resetMultiState();
  };

  const handleSidebarNewChat = () => {
    setSelectedSavedSinglePlan(null);
    setSelectedSavedMultiPlan(null);
    resetMultiState();
    setSelectedPlan("single");
  };

  const handleSidebarSelectPlan = (plan: Record<string, unknown>) => {
    const typedPlan = plan as ChatSavedPlan &
      Partial<MultiPlanRecord> & { mode?: string };

    resetMultiState();

    if (typedPlan.mode === "multi" || Array.isArray(typedPlan.semesters)) {
      setSelectedSavedMultiPlan(typedPlan as MultiPlanRecord);
      setSelectedSavedSinglePlan(null);
      setSelectedPlan("saved-multi");
    } else {
      setSelectedSavedSinglePlan(typedPlan as ChatSavedPlan);
      setSelectedSavedMultiPlan(null);
      setSelectedPlan("saved");
    }
  };

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-600">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !userData) {
    return null;
  }

  return (
    <div className="h-screen">
      <Sidebar
        userData={userData}
        onNewChat={handleSidebarNewChat}
        onSelectSavedPlan={handleSidebarSelectPlan}
        onNavigate={handleSidebarNavigate}
        refreshKey={sidebarRefreshKey}
        onLogout={handleLogout}
        onPlanDeleted={(deletedPlanId) => {
          const activeId =
            selectedSavedSinglePlan?.id ||
            selectedSavedMultiPlan?.id ||
            createdMultiPlanId ||
            activeSinglePlanId;

          if (activeId && String(activeId) === String(deletedPlanId)) {
            setSelectedPlan(null);
            setSelectedSavedSinglePlan(null);
            setSelectedSavedMultiPlan(null);
            setActiveSinglePlanId(null);
            resetMultiState();
          }
        }}
      />

      <div style={{ marginLeft: "260px", height: "100%" }}>
        {!selectedPlan ? (
          <PlanSelection
            onSelectPlan={handleSelectPlanType}
            userData={userData}
            onLogout={handleLogout}
          />
        ) : selectedPlan === "saved" && !selectedSavedSinglePlan ? (
          <SavedPlansUI
            userData={userData}
            onLogout={handleLogout}
            onBack={handleBackToPlanSelection}
            onSelectPlan={handleSelectSavedPlan}
            onPlanDeleted={() => handlePlanSaved()}
            refreshKey={sidebarRefreshKey}
          />
        ) : selectedPlan === "saved-multi" &&
          selectedSavedMultiPlan &&
          !selectedSemester ? (
          <MultiSemesterUI
            key={String(selectedSavedMultiPlan.id)}
            userData={userData}
            onLogout={handleLogout}
            onSelectSemester={handleSelectSemester}
            savedPlan={selectedSavedMultiPlan}
            onPlanSaved={() => handlePlanSaved()}
            onPlanCreated={handlePlanCreated}
            initialTitle={multiPlanTitle || selectedSavedMultiPlan.name}
            onTitleChange={setMultiPlanTitle}
            planId={selectedSavedMultiPlan.id}
          />
        ) : selectedPlan === "saved-multi" && selectedSemester ? (
          <ChatUI
            key={semesterChatKey}
            userData={userData}
            onLogout={handleLogout}
            semester={selectedSemester}
            onBack={handleBackToMultiSemester}
            onPlanSaved={handlePlanSaved}
            onPlanCreated={handlePlanCreated}
          />
        ) : selectedPlan === "saved" && selectedSavedSinglePlan ? (
          <ChatUI
            key={String(selectedSavedSinglePlan.id)}
            userData={userData}
            onLogout={handleLogout}
            onBack={handleBackToSavedPlans}
            savedPlan={selectedSavedSinglePlan}
            onPlanSaved={handlePlanSaved}
          />
        ) : selectedPlan === "single" ? (
          <ChatUI
            key={String(resetKey)}
            userData={userData}
            onLogout={handleLogout}
            onBack={handleBackToPlanSelection}
            onPlanSaved={handlePlanSaved}
          />
        ) : selectedPlan === "multi" && !selectedSemester ? (
          <MultiSemesterUI
            key={String(resetKey)}
            userData={userData}
            onLogout={handleLogout}
            onSelectSemester={handleSelectSemester}
            onPlanSaved={() => handlePlanSaved()}
            onPlanCreated={handlePlanCreated}
            onPlanIdSaved={handleMultiPlanIdSaved}
            initialTitle={multiPlanTitle}
            onTitleChange={setMultiPlanTitle}
            planId={createdMultiPlanId}
          />
        ) : selectedPlan === "multi" && selectedSemester ? (
          <ChatUI
            key={semesterChatKey}
            userData={userData}
            onLogout={handleLogout}
            semester={selectedSemester}
            onBack={handleBackToMultiSemester}
            onPlanSaved={handlePlanSaved}
            onPlanCreated={handlePlanCreated}
          />
        ) : null}
      </div>
    </div>
  );
}
