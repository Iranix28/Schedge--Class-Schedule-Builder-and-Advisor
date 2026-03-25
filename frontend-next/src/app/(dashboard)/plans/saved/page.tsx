"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import SavedPlansUI from "@/features/plans/components/SavedPlansUI";

export default function SavedPlansPage() {
  const router = useRouter();
  const { userData, onLogout, sidebarRefreshKey, refreshSidebar } =
    useDashboardShell();

  const handleSelectPlan = useCallback(
    (plan: Record<string, unknown>) => {
      const planId = plan.id;

      if (planId === undefined || planId === null) return;

      router.push(`/plans/${String(planId)}`);
    },
    [router],
  );

  const handlePlanDeleted = useCallback(() => {
    refreshSidebar();
  }, [refreshSidebar]);

  return (
    <SavedPlansUI
      userData={userData}
      onLogout={onLogout}
      onBack={() => router.push("/plans/new")}
      onSelectPlan={handleSelectPlan}
      onPlanDeleted={handlePlanDeleted}
      refreshKey={sidebarRefreshKey}
    />
  );
}
