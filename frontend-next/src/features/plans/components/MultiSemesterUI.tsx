"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  fetchCourseCatalog,
  fetchMultiPlanDetail,
  saveOrUpdateMultiPlan,
  updatePlanName,
} from "../services/plans.service";
import type {
  BackendSemester,
  MultiPlanRecord,
  MultiSemesterUIProps,
  SemesterUI,
} from "../types/plan.types";

// Module-level cache — persists across mounts, fetched only once per session
let _catalogCache: Array<{ department?: string; course_code?: string | number; credits?: number | string }> | null = null;
let _catalogPromise: Promise<typeof _catalogCache> | null = null;

const getCatalog = async () => {
  if (_catalogCache) return _catalogCache;
  if (!_catalogPromise) {
    _catalogPromise = fetchCourseCatalog().then((data) => {
      _catalogCache = data;
      return data;
    }).catch(() => {
      _catalogPromise = null; // allow retry on failure
      return [];
    });
  }
  return _catalogPromise;
};

// Multi-semester planner view — lets users create, name, and manage a multi-semester degree plan
export default function MultiSemesterUI({
  userData,
  onLogout,
  onSelectSemester,
  savedPlan,
  onPlanSaved,
  onPlanCreated,
  onPlanIdSaved,
  initialTitle,
  onTitleChange,
  planId,
  externalSemesters,
  onSemestersChange,
}: MultiSemesterUIProps & {
  externalSemesters?: SemesterUI[];
  onSemestersChange?: (semesters: SemesterUI[]) => void;
}) {
  void onLogout;
  void onPlanCreated;

  const [plannerTitle, setPlannerTitle] = useState(initialTitle || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<number | string | null>(
    null,
  );
  const titleMountedRef = useRef(false); // Prevents autosave on initial mount
  const isSavingRef = useRef(false);     // Prevents savedPlan sync overwriting state mid-save
  const hasSyncedFromProp = useRef(false); // Only sync semesters from savedPlan prop once (on mount)

  // ── Course catalog for credit lookups ──────────────────────────────────
  const [courseCatalog, setCourseCatalog] = useState<
    Array<{
      department?: string;
      course_code?: string | number;
      credits?: number | string;
    }>
  >([]);
  const [catalogReady, setCatalogReady] = useState(false);

  // Fetch full course catalog on mount — uses module-level cache so it only
  // hits the network once per session regardless of how many times this mounts
  useEffect(() => {
    let cancelled = false;
    // If already cached, resolve synchronously without showing loader
    if (_catalogCache) {
      setCourseCatalog(_catalogCache);
      setCatalogReady(true);
      return;
    }
    void (async () => {
      try {
        const courses = await getCatalog();
        if (!cancelled) setCourseCatalog(courses ?? []);
      } catch (e) {
        console.warn("[MultiSemesterUI] failed to fetch course catalog:", e);
      } finally {
        if (!cancelled) setCatalogReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build "DEPT CODE" -> credits lookup map from catalog
  const creditsByDeptCode = useMemo(() => {
    const map: Record<string, number> = {};
    courseCatalog.forEach((c) => {
      const credits =
        typeof c.credits === "number"
          ? c.credits
          : parseFloat(String(c.credits)) || 0;
      if (c.department && c.course_code) {
        map[`${String(c.department).toUpperCase()} ${c.course_code}`] = credits;
      }
    });
    return map;
  }, [courseCatalog]);

  // Extract "DEPT CODE" from a class name string (e.g. "CS 101 - Intro" -> "CS 101")
  const parseDeptCode = (className?: string | null) => {
    if (!className || typeof className !== "string") return null;
    const match = className.match(/^([A-Z]+)\s+(\d+)/);
    return match ? `${match[1]} ${match[2]}` : null;
  };

  // Compute credits for a semester: always derive from courses/schedule via catalog.
  // Only fall back to stored total_credits/credits if there are no course items to compute from.
  const computeSemesterCredits = (semester: SemesterUI | BackendSemester) => {
    const items = [...(semester.schedule || []), ...(semester.courses || [])];

    if (items.length === 0) {
      // No course data — fall back to whatever the backend stored
      return (semester.total_credits || 0) > 0
        ? semester.total_credits || 0
        : semester.credits || 0;
    }

    const seen = new Set<string>();
    let total = 0;
    items.forEach((item) => {
      const key = parseDeptCode(
        String(
          (item as { class_?: string; class_name?: string }).class_ ||
            (item as { class_?: string; class_name?: string }).class_name ||
            "",
        ),
      );
      if (key && !seen.has(key)) {
        seen.add(key);
        total += creditsByDeptCode[key] || 0;
      }
    });
    return total;
  };
  // ────────────────────────────────────────────────────────────────────────

  // Sync active plan ID from props.
  // When planId becomes null (new plan), also reset stale state so the old plan's
  // ID doesn't leak into autosave/save calls for the new plan.
  useEffect(() => {
    const resolved = savedPlan?.id || planId || null;
    setActivePlanId(resolved);
    if (!resolved) {
      // Full reset for new-plan flow — clear title autosave guard and semester sync guard
      titleMountedRef.current = false;
      hasSyncedFromProp.current = false;
      setPlannerTitle(initialTitle || "");
    }
  }, [savedPlan?.id, planId]);

  // Update title locally and notify parent
  const handleTitleChange = (val: string) => {
    setPlannerTitle(val);
    if (onTitleChange) onTitleChange(val);
  };

  // Debounced autosave of plan name (1s after typing stops)
  // NOTE: does NOT call onPlanSaved — title changes don't need a full plan re-fetch
  // and doing so would cause an infinite loop (re-fetch → re-render → effect re-runs)
  useEffect(() => {
    if (!titleMountedRef.current) {
      titleMountedRef.current = true;
      return;
    }
    const currentPlanId = activePlanId;
    if (!currentPlanId || !userData?.id || !plannerTitle.trim()) return;
    const timer = setTimeout(async () => {
      try {
        await updatePlanName(
          currentPlanId,
          userData.id as number | string,
          plannerTitle.trim(),
        );
      } catch (e) {
        console.error("[MultiSemesterUI] failed to autosave plan name:", e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [plannerTitle, activePlanId, userData?.id]);

  // Determine the next upcoming semester based on current date
  const getNextSemester = () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month >= 0 && month <= 3) return { term: "Summer", year };
    if (month >= 4 && month <= 6) return { term: "Fall", year };
    return { term: "Spring", year: year + 1 };
  };

  // Convert backend semester object to local UI format
  const mapSemesterFromBackend = (
    sem: BackendSemester,
    idx: number,
    planIdVal: number | string,
  ): SemesterUI => ({
    id: idx + 1,
    name: `${sem.term_season} ${sem.term_year}`,
    year: sem.term_year,
    term: sem.term_season,
    credits: sem.total_credits || 0,
    total_credits: sem.total_credits || 0,
    total_courses: sem.total_courses ?? (sem.courses || []).length,
    courses: sem.courses || [],
    plan_id: planIdVal,
    semester_db_id: sem.id,
    messages: sem.messages || [],
    schedule: sem.schedule || [],
  });

  // Build initial semester list from saved plan or create a default one
  const buildInitialSemesters = (): SemesterUI[] => {
    if (savedPlan && savedPlan.semesters && savedPlan.semesters.length > 0) {
      return savedPlan.semesters.map((sem, idx) =>
        mapSemesterFromBackend(sem, idx, savedPlan.id),
      );
    }
    const initialSemester = getNextSemester();
    return [
      {
        id: 1,
        name: `${initialSemester.term} ${initialSemester.year}`,
        year: initialSemester.year,
        term: initialSemester.term,
        credits: 0,
        total_credits: 0,
        courses: [],
        schedule: [],
      },
    ];
  };

  // Sync title from saved plan when it changes
  useEffect(() => {
    if (savedPlan) handleTitleChange(savedPlan.name || "");
  }, [savedPlan?.name]);

  // Sync semesters from savedPlan prop — only once on initial mount.
  // After that, semester state is owned entirely by this component.
  useEffect(() => {
    if (hasSyncedFromProp.current) return;
    if (isSavingRef.current) return;
    if (savedPlan && savedPlan.semesters && savedPlan.semesters.length > 0) {
      hasSyncedFromProp.current = true;
      setSemesters(
        savedPlan.semesters.map((sem, idx) =>
          mapSemesterFromBackend(sem, idx, savedPlan.id),
        ),
      );
    }
  }, [savedPlan]);

  const [internalSemesters, setInternalSemesters] = useState<SemesterUI[]>(
    buildInitialSemesters,
  );
  const semesters = externalSemesters ?? internalSemesters;
  const setSemesters = (val: SemesterUI[] | ((prev: SemesterUI[]) => SemesterUI[])) => {
    const resolved = typeof val === "function" ? val(semesters) : val;
    setInternalSemesters(resolved);
    if (onSemestersChange) onSemestersChange(resolved);
  };

  // CSS for pulsing border animation and title input autofill styling
  const pulseStyle = `
		@keyframes pulseBorder { 0%, 100% { border-color: #cbd5e1; } 50% { border-color: #BE0000; } }
		.pulse-border { animation: pulseBorder 2s ease-in-out infinite; }
		.plan-title-input:-webkit-autofill,
		.plan-title-input:-webkit-autofill:hover,
		.plan-title-input:-webkit-autofill:focus {
			-webkit-box-shadow: 0 0 0px 1000px #BE0000 inset !important;
			-webkit-text-fill-color: white !important;
			transition: background-color 5000s ease-in-out 0s;
		}
		.plan-title-input::selection { background: rgba(255,255,255,0.3); color: white; }
		.plan-title-input:focus { background: transparent !important; }
	`;

  // Sync a given semester list to the backend immediately (used by add/remove)
  const syncSemesters = async (updatedSemesters: SemesterUI[]) => {
    if (!userData?.id || !activePlanId) return; // only sync if plan already exists
    const name = plannerTitle.trim() || "Multi-Semester Plan";
    const payload = {
      user_id: userData.id,
      name,
      semesters: updatedSemesters.map((sem) => ({
        semester_db_id: sem.semester_db_id ?? null,
        term_season: sem.term,
        term_year: sem.year,
        courses: sem.courses || [],
      })),
    };
    try {
      isSavingRef.current = true;
      await saveOrUpdateMultiPlan(activePlanId, payload);
      // Re-fetch to get server-assigned IDs for any newly added semesters
      const fullPlan = (await fetchMultiPlanDetail(userData.id, activePlanId)) as MultiPlanRecord;
      if (fullPlan.semesters) {
        const synced = fullPlan.semesters.map((sem, idx) =>
          mapSemesterFromBackend(sem, idx, activePlanId),
        );
        setSemesters(synced);
      }
      if (onPlanSaved) void onPlanSaved();
    } catch (e) {
      console.error("[MultiSemesterUI] failed to sync semesters:", e);
    } finally {
      isSavingRef.current = false;
    }
  };

  // Add a new semester sequentially after the last one (Spring -> Summer -> Fall -> Spring)
  const handleAddSemester = () => {
    const lastSemester = semesters[semesters.length - 1];
    let newTerm: string, newYear: number;
    if (lastSemester.term === "Spring") {
      newTerm = "Summer";
      newYear = lastSemester.year;
    } else if (lastSemester.term === "Summer") {
      newTerm = "Fall";
      newYear = lastSemester.year;
    } else {
      newTerm = "Spring";
      newYear = lastSemester.year + 1;
    }
    const updated = [
      ...semesters,
      {
        id: semesters.length + 1,
        name: `${newTerm} ${newYear}`,
        year: newYear,
        term: newTerm,
        credits: 0,
        total_credits: 0,
        courses: [],
        schedule: [],
      },
    ];
    setSemesters(updated);
    void syncSemesters(updated);
  };

  // Remove a semester (minimum one must remain)
  const handleRemoveSemester = (semesterId: number) => {
    if (semesters.length <= 1) {
      alert("You must have at least one semester");
      return;
    }
    // Re-number display ids after removal, but preserve semester_db_id for backend matching
    const updated = semesters
      .filter((sem) => sem.id !== semesterId)
      .map((sem, idx) => ({ ...sem, id: idx + 1 }));
    setSemesters(updated);
    void syncSemesters(updated);
  };

  // Save or update the entire multi-semester plan to the backend
  const handleSavePlan = async () => {
    if (!userData?.id) {
      alert("User not loaded");
      return;
    }
    const name = plannerTitle.trim() || "Multi-Semester Plan";
    const existingPlanId = activePlanId;
    const payload = {
      user_id: userData.id,
      name,
      semesters: semesters.map((sem) => ({
        semester_db_id: sem.semester_db_id ?? null,
        term_season: sem.term,
        term_year: sem.year,
        courses: sem.courses || [],
      })),
    };
    let savedSuccessfully = false;
    try {
      setIsSaving(true);
      isSavingRef.current = true;
      const data = await saveOrUpdateMultiPlan(existingPlanId, payload);
      // Track new plan ID if this was a first-time save
      if (!existingPlanId && data.id) {
        setActivePlanId(data.id);
        if (onPlanIdSaved) onPlanIdSaved(data.id);
      }
      // Re-fetch full plan to get server-assigned IDs and updated data
      const savedPlanId = existingPlanId || data.id;
      try {
        const fullPlan = (await fetchMultiPlanDetail(
          userData.id,
          savedPlanId,
        )) as MultiPlanRecord;
        if (fullPlan.semesters) {
          setSemesters(
            fullPlan.semesters.map((sem, idx) =>
              mapSemesterFromBackend(sem, idx, savedPlanId),
            ),
          );
        }
      } catch (e) {
        console.error(
          "[MultiSemesterUI] failed to refresh semesters after save:",
          e,
        );
      }
      savedSuccessfully = true;
      setSaveToast(existingPlanId ? "Plan updated!" : "Plan saved!");
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      console.error("Save error:", err);
      setSaveToast("Error saving: " + (err instanceof Error ? err.message : "Unknown error"));
      setTimeout(() => setSaveToast(null), 4000);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
      if (savedSuccessfully && onPlanSaved) void onPlanSaved();
    }
  };

  // Show loader while catalog loads (only if semesters have courses that need credit data)
  const hasCourses = semesters.some(
    (s) =>
      (s.total_courses ?? s.courses.length) > 0 ||
      (s.schedule || []).length > 0,
  );
  const showLoading = !catalogReady && hasCourses;

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <style>{pulseStyle}</style>

      {saveToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white font-medium text-sm"
          style={{ backgroundColor: saveToast.startsWith("Error") ? "#b91c1c" : "#15803d" }}
        >
          {saveToast}
        </div>
      )}

      {/* Header with editable plan title */}
      <header
        className="px-6 py-4 flex items-center justify-between shadow-sm"
        style={{ backgroundColor: "#BE0000" }}
      >
        <div className="flex items-center gap-3">
          <div className="relative group">
            <input
              type="text"
              value={plannerTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Multi-Semester Planner"
              className="plan-title-input bg-transparent text-white font-semibold text-xl border-none focus:outline-none focus:ring-0 transition-all pr-8"
              style={{
                minWidth: "150px",
                caretColor: "white",
                WebkitAppearance: "none",
                boxShadow: "none",
              }}
            />
            <svg
              className="w-4 h-4 text-white absolute right-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Page heading */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">
              Plan Your Academic Journey
            </h2>
            <p className="text-slate-600">
              Click on any semester to start planning your courses
            </p>
          </div>

          {showLoading ? (
            <div className="text-center py-12">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3"
                style={{ borderColor: "#BE0000" }}
              ></div>
              <p className="text-slate-500">Loading course data...</p>
            </div>
          ) : (
            <>
              {/* Semester cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {semesters.map((semester, index) => {
                  const displayCredits = computeSemesterCredits(semester);
                  return (
                    // Clickable semester card — opens semester detail/planning view
                    <div
                      key={semester.id}
                      onClick={() => {
                        const currentPlanId = activePlanId || null;
                        onSelectSemester({
                          ...semester,
                          _planTitle:
                            plannerTitle.trim() || "Multi-Semester Plan",
                          _allSemesters: semesters,
                          ...(currentPlanId && !semester.plan_id
                            ? { _existingPlanId: currentPlanId }
                            : {}),
                        });
                      }}
                      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group hover:scale-105 border-2 border-transparent hover:border-red-700"
                    >
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-slate-500">
                                Semester {index + 1}
                              </span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 group-hover:text-red-700 transition-colors">
                              {semester.name}
                            </h3>
                          </div>
                          {/* Remove semester button (hidden if only one semester) */}
                          {semesters.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSemester(semester.id);
                              }}
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              title="Remove semester"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Course and credit counts */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
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
                                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                              />
                            </svg>
                            <span>
                              {semester.total_courses ??
                                semester.courses.length}{" "}
                              course
                              {(semester.total_courses ??
                                semester.courses.length) !== 1
                                ? "s"
                                : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
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
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <span>
                              {displayCredits} credit
                              {displayCredits !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Card footer CTA */}
                      <div
                        className="px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-2 text-sm font-medium group-hover:bg-red-50 transition-colors"
                        style={{ color: "#BE0000" }}
                      >
                        <span>Plan This Semester</span>
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
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add semester button (pulses when only one semester exists) */}
              <button
                type="button"
                onClick={handleAddSemester}
                className={
                  "w-full py-4 border-2 border-dashed rounded-xl hover:border-red-700 hover:bg-red-50 transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-red-700 font-medium " +
                  (semesters.length === 1 ? "pulse-border" : "border-slate-300")
                }
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Another Semester
              </button>

              {/* Save/update plan button */}
              <button
                type="button"
                onClick={() => void handleSavePlan()}
                disabled={isSaving}
                className="w-full mt-3 py-4 rounded-xl font-semibold text-white transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#BE0000" }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {isSaving ? "Saving..." : "Save Plan"}
              </button>

              {/* Degree summary — totals across all semesters */}
              <div className="mt-6 bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Degree Summary
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-800">
                      {semesters.length}
                    </div>
                    <div className="text-sm text-slate-600">
                      Total Semesters
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-800">
                      {semesters.reduce(
                        (sum, sem) =>
                          sum + (sem.total_courses ?? sem.courses.length),
                        0,
                      )}
                    </div>
                    <div className="text-sm text-slate-600">Total Courses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-800">
                      {semesters.reduce(
                        (sum, sem) => sum + computeSemesterCredits(sem),
                        0,
                      )}
                    </div>
                    <div className="text-sm text-slate-600">Total Credits</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}