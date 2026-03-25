"use client";

import {
  useState,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  deleteUserPlan,
  fetchFullPlan,
  fetchUserPlans,
} from "../services/sidebar.service";
import type { SidebarPlan, SidebarProps } from "../types/sidebar.types";

// Fixed left sidebar — provides navigation, plan search, saved plans list, and user controls
export default function Sidebar({
  userData,
  onNewChat,
  onSelectSavedPlan,
  onNavigate,
  refreshKey,
  onLogout,
  onPlanDeleted,
}: SidebarProps) {
  void onNewChat;

  const [savedPlans, setSavedPlans] = useState<SidebarPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch saved plans on mount and when user or refreshKey changes
  useEffect(() => {
    if (!userData?.id) return;
    void fetchPlans();
  }, [userData, refreshKey]);

  // Auto-focus search input when toggled open
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Load all saved plans for the current user
  const fetchPlans = async () => {
    if (!userData?.id) return;
    const userId = userData.id;

    try {
      setIsLoadingPlans(true);
      const data = await fetchUserPlans(userId);
      setSavedPlans(data);
    } catch (err) {
      console.error("Failed to fetch plans:", err);
      setSavedPlans([]);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  // Delete a plan and notify parent (e.g. to navigate away if it was active)
  const handleDeletePlan = async (
    e: MouseEvent<HTMLButtonElement>,
    plan: SidebarPlan,
  ) => {
    e.stopPropagation();
    if (!confirm(`Delete "${plan.name}"?`)) return;
    if (!userData?.id) return;

    const userId = userData.id;

    // Optimistically remove from local UI immediately
    setSavedPlans((prev) => prev.filter((p) => p.id !== plan.id));

    try {
      await deleteUserPlan(userId, plan.id);
      // Only notify parent AFTER the backend confirms deletion.
      // This prevents the parent from bumping sidebarRefreshKey before
      // the DELETE completes, which would re-fetch and restore the plan.
      if (onPlanDeleted) onPlanDeleted(plan.id);
    } catch (err) {
      // Real error — restore the plan in the list
      setSavedPlans((prev) => {
        if (prev.find((p) => p.id === plan.id)) return prev;
        return [...prev, plan].sort((a, b) => a.name.localeCompare(b.name));
      });
      console.error("Failed to delete plan:", err);
      alert("Could not delete plan. Please try again.");
    }
  };

  // Fetch full plan detail (single or multi) and pass to parent
  const handleSelectPlan = async (plan: SidebarPlan) => {
    if (!userData?.id) return;
    const userId = userData.id;

    try {
      const fullPlan = await fetchFullPlan(userId, plan);
      onSelectSavedPlan(fullPlan);
    } catch (err) {
      console.error("Failed to load full plan:", err);
      alert("Could not load plan");
    }
  };

  // Filter plans by name or term/year against search query
  const filteredPlans = savedPlans.filter(
    (plan) =>
      plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${plan.term_season || ""} ${plan.term_year || ""}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      {/* Sidebar container — fixed left, full height */}
      <div
        className="fixed top-0 left-0 h-full z-40 flex flex-col"
        style={{
          width: "260px",
          backgroundColor: "#171717",
        }}
      >
        <div
          className="flex flex-col h-full"
          style={{ width: "260px", minWidth: "260px" }}
        >
          {/* Top: Logo / Home button */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <button
              type="button"
              onClick={() => onNavigate(null)}
              className="flex items-center gap-2 rounded-lg hover:opacity-80 transition-opacity"
              title="Home"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#BE0000" }}
              >
                <span className="text-white text-sm font-bold">S</span>
              </div>
            </button>
          </div>

          {/* Search bar — toggles between button and input */}
          <div className="px-2 pt-2 pb-1">
            {showSearch ? (
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => {
                    if (!searchQuery) setShowSearch(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchQuery("");
                      setShowSearch(false);
                    }
                  }}
                  placeholder="Search plans..."
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border-0 outline-none text-neutral-200 placeholder-neutral-500"
                  style={{ backgroundColor: "#2a2a2a" }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <span>Search plans</span>
              </button>
            )}
          </div>

          {/* Navigation: Home, Single semester, Multi-semester */}
          <div className="px-2 pt-1 pb-2 space-y-0.5">
            <NavItem
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
                  />
                </svg>
              }
              label="Home"
              onClick={() => onNavigate(null)}
            />

            <div className="mx-1 my-1 border-t border-neutral-800" />

            <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">
              New Plan
            </div>
            <NavItem
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
              label="Single semester"
              onClick={() => onNavigate("single")}
            />
            <NavItem
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
              label="Multi-semester"
              onClick={() => onNavigate("multi")}
            />
          </div>

          <div className="mx-3 border-t border-neutral-800" />

          {/* Saved plans list — scrollable, shows loading/empty/filtered results */}
          <div
            className="flex-1 overflow-y-auto px-0 pt-2 pb-2"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#404040 transparent",
            }}
          >
            {isLoadingPlans ? (
              <div className="px-3 py-4">
                <div className="flex items-center gap-2 text-neutral-500 text-sm">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Loading plans...</span>
                </div>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="px-3 py-4 text-neutral-500 text-sm text-center">
                {searchQuery ? "No matching plans" : "No saved plans yet"}
              </div>
            ) : (
              <div className="mb-3">
                {/* "Your Plans" header — navigates to full saved plans view */}
                <button
                  type="button"
                  onClick={() => onNavigate("saved")}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wider hover:text-white transition-colors cursor-pointer text-left"
                >
                  Your Plans &rsaquo;
                </button>
                {filteredPlans.map((plan) => (
                  <PlanItem
                    key={plan.id}
                    plan={plan}
                    onSelect={() => {
                      void handleSelectPlan(plan);
                    }}
                    onDelete={(e) => {
                      void handleDeletePlan(e, plan);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom: User avatar, name, and logout */}
          <div className="border-t border-neutral-800">
            <div className="px-2 py-2">
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-all group">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: "#BE0000" }}
                >
                  {(userData?.username || "U")[0].toUpperCase()}
                </div>
                <span className="text-sm text-neutral-300 truncate flex-1">
                  {userData?.username || "User"}
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  title="Logout"
                  className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-neutral-400 hover:text-white hover:bg-red-700 transition-all"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Reusable sidebar navigation button ── */
function NavItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all text-left"
    >
      <span className="flex-shrink-0 text-neutral-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ── Single plan row in the sidebar list — color-coded by mode (single/multi) ── */
function PlanItem({
  plan,
  onSelect,
  onDelete,
}: {
  plan: SidebarPlan;
  onSelect: () => void;
  onDelete: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isMulti = plan.mode === "multi";

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg cursor-pointer text-sm transition-all relative"
      style={{
        color: hovered ? "#fff" : "#d4d4d4",
        backgroundColor: hovered
          ? isMulti
            ? "#2d1f4e"
            : "#2a1515"
          : "transparent",
      }}
    >
      {/* Mode indicator icon (purple for multi, red for single) */}
      <div
        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: isMulti ? "#4c1d95" : "#3b0a0a" }}
      >
        {isMulti ? (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="#a78bfa"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V6a2 2 0 012-2h6a2 2 0 012 2v1M7 7h10"
            />
          </svg>
        ) : (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="#f87171"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </div>

      <span className="truncate flex-1 text-xs">{plan.name}</span>

      {/* Delete button — visible on hover */}
      {hovered && (
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all text-neutral-400 hover:text-red-400"
          title="Delete plan"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
