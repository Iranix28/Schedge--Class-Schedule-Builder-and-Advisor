"use client";

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useDashboardShell } from "@/components/layout/DashboardShell";
import {
  BASE_URL,
  REGISTRATION_URL,
  autosaveSemesterRequest,
  createMultiPlanRequest,
  createSemesterForPlanRequest,
  fetchAllCoursesRequest,
  fetchCourseSectionsRequest,
  fetchMultiPlanDetailRequest,
  saveSinglePlanRequest,
  sendMessageLLM,
  uploadAuditFile,
  fetchCourseGradeStatsRequest,
  fetchProfessorRating,
} from "../services/chat.service";
import type {
  ChatMessage,
  ChatUIProps,
  Course,
  SavedPlanIds,
  Section,
  VisualizationData,
  VisualizationItem,
  CourseGradeStats,
} from "../types/chat.types";

import CourseGradeDistributionModal from "./CourseGradeDistributionModal";

// ── Prerequisite Chain Visualizer ─────────────────────────────────────────────

interface PrereqNode {
  id: number;
  label: string;
}

interface PrereqChainVizProps {
  prereqs: PrereqNode[];
  current: { label: string };
  unlocks: PrereqNode[];
}

function PrereqChainViz({ prereqs, current, unlocks }: PrereqChainVizProps) {
  const hasPrereqs = prereqs.length > 0;
  const hasUnlocks = unlocks.length > 0;

  if (!hasPrereqs && !hasUnlocks) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 py-5 px-4 text-center text-slate-400 text-sm">
        No prerequisite relationships found for this course.
      </div>
    );
  }

  const NODE_H = 38;
  const MIN_NODE_W = 100;
  const CHAR_WIDTH = 7.5;
  const NODE_PADDING = 24;
  const COL_GAP = 60;
  const ROW_GAP = 12;
  const PILL_R = 8;
  const ARROW_SZ = 6;
  const MARGIN = 10;

  const calcNodeWidth = (label: string) =>
    Math.max(MIN_NODE_W, label.length * CHAR_WIDTH + NODE_PADDING);

  const prereqMaxW = hasPrereqs
    ? Math.max(...prereqs.map((p) => calcNodeWidth(p.label)))
    : 0;
  const currentW = calcNodeWidth(current.label);
  const unlockMaxW = hasUnlocks
    ? Math.max(...unlocks.map((u) => calcNodeWidth(u.label)))
    : 0;

  const prereqCX = hasPrereqs ? MARGIN + prereqMaxW / 2 : 0;
  const currentCX =
    (hasPrereqs ? MARGIN + prereqMaxW + COL_GAP : MARGIN) + currentW / 2;
  const unlockCX = hasUnlocks
    ? (hasPrereqs ? MARGIN + prereqMaxW + COL_GAP : MARGIN) +
      currentW +
      COL_GAP +
      unlockMaxW / 2
    : 0;

  const totalW =
    MARGIN +
    (hasPrereqs ? prereqMaxW + COL_GAP : 0) +
    currentW +
    (hasUnlocks ? COL_GAP + unlockMaxW : 0) +
    MARGIN;

  const colH = (n: number) =>
    Math.max(1, n) * NODE_H + (Math.max(1, n) - 1) * ROW_GAP;
  const totalH =
    Math.max(
      hasPrereqs ? colH(prereqs.length) : NODE_H,
      NODE_H,
      hasUnlocks ? colH(unlocks.length) : NODE_H,
    ) + 50;

  const centredYs = (count: number) => {
    const bH = colH(count);
    const start = (totalH - bH) / 2 + NODE_H / 2;
    return Array.from(
      { length: count },
      (_, i) => start + i * (NODE_H + ROW_GAP),
    );
  };

  const prereqYs = hasPrereqs ? centredYs(prereqs.length) : [];
  const currentY = totalH / 2;
  const unlockYs = hasUnlocks ? centredYs(unlocks.length) : [];

  const PAL = {
    prereq: { fill: "#FFF3E0", stroke: "#FB8C00", text: "#7C3800" },
    current: { fill: "#BE0000", stroke: "#7A0000", text: "#FFFFFF" },
    unlock: { fill: "#E8F5E9", stroke: "#43A047", text: "#145214" },
  };

  const Node = ({
    label,
    cx,
    cy,
    pal,
    width,
  }: {
    label: string;
    cx: number;
    cy: number;
    pal: { fill: string; stroke: string; text: string };
    width: number;
  }) => (
    <g>
      <rect
        x={cx - width / 2}
        y={cy - NODE_H / 2}
        width={width}
        height={NODE_H}
        rx={PILL_R}
        ry={PILL_R}
        fill={pal.fill}
        stroke={pal.stroke}
        strokeWidth="1.5"
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="700"
        fill={pal.text}
        fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
    </g>
  );

  const Arrow = ({
    x1,
    y1,
    x2,
    y2,
  }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }) => {
    const mx = (x1 + x2) / 2;
    return (
      <g>
        <path
          d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
          fill="none"
          stroke="#CBD5E1"
          strokeWidth="1.5"
        />
        <path
          d={`M${x2},${y2} L${x2 - ARROW_SZ},${y2 - ARROW_SZ / 2} L${x2 - ARROW_SZ},${y2 + ARROW_SZ / 2}Z`}
          fill="#CBD5E1"
        />
      </g>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 overflow-x-auto">
      <svg
        width={totalW}
        height={totalH}
        style={{ display: "block", minWidth: totalW }}
      >
        {hasPrereqs && (
          <text
            x={prereqCX}
            y={14}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill="#94A3B8"
            fontFamily="system-ui,sans-serif"
          >
            PREREQUISITES
          </text>
        )}
        <text
          x={currentCX}
          y={14}
          textAnchor="middle"
          fontSize="8.5"
          fontWeight="700"
          fill="#94A3B8"
          fontFamily="system-ui,sans-serif"
        >
          THIS COURSE
        </text>
        {hasUnlocks && (
          <text
            x={unlockCX}
            y={14}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill="#94A3B8"
            fontFamily="system-ui,sans-serif"
          >
            ENABLED
          </text>
        )}

        {prereqYs.map((py, i) => {
          const prereqW = calcNodeWidth(prereqs[i].label);
          return (
            <Arrow
              key={`pa${i}`}
              x1={prereqCX + prereqW / 2 + 2}
              y1={py}
              x2={currentCX - currentW / 2 - ARROW_SZ}
              y2={currentY}
            />
          );
        })}

        {unlockYs.map((uy, i) => {
          const unlockW = calcNodeWidth(unlocks[i].label);
          return (
            <Arrow
              key={`ua${i}`}
              x1={currentCX + currentW / 2 + 2}
              y1={currentY}
              x2={unlockCX - unlockW / 2 - ARROW_SZ}
              y2={uy}
            />
          );
        })}

        {prereqs.map((p, i) => (
          <Node
            key={`p${i}`}
            label={p.label}
            cx={prereqCX}
            cy={prereqYs[i]}
            pal={PAL.prereq}
            width={calcNodeWidth(p.label)}
          />
        ))}

        <Node
          label={current.label}
          cx={currentCX}
          cy={currentY}
          pal={PAL.current}
          width={currentW}
        />

        {unlocks.map((u, i) => (
          <Node
            key={`u${i}`}
            label={u.label}
            cx={unlockCX}
            cy={unlockYs[i]}
            pal={PAL.unlock}
            width={calcNodeWidth(u.label)}
          />
        ))}
      </svg>
    </div>
  );
}

// ── ChatUI ────────────────────────────────────────────────────────────────────

export default function ChatUI({
  userData,
  onLogout,
  onBack,
  savedPlan,
  semester,
  onPlanSaved,
  onPlanCreated,
}: ChatUIProps) {
  void onLogout;
  const { courseCatalog, isCourseCatalogLoading } = useDashboardShell();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I am your class advisor, please submit your degree audit by pressing the + button! (ONLY HTML)",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; size: string; type: string }>
  >([]);
  const [visualizationData, setVisualizationData] =
    useState<VisualizationData | null>(null);
  const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);
  const [class_code, setClass_code] = useState("");
  const [availableSections, setAvailableSections] = useState<Section[]>([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showCoursesPanel, setShowCoursesPanel] = useState(false);
  const [allCourses, setAllCourses] = useState<Course[]>(courseCatalog || []);
  const [isLoadingCourses, setIsLoadingCourses] = useState(
    isCourseCatalogLoading && (!courseCatalog || courseCatalog.length === 0),
  );
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [browserDepartmentFilter, setBrowserDepartmentFilter] = useState("");
  const [showCourseDetailModal, setShowCourseDetailModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showGradeDistributionModal, setShowGradeDistributionModal] =
    useState(false);
  const [hoveredScheduleItem, setHoveredScheduleItem] = useState<string | null>(
    null,
  );
  const [prereqChain, setPrereqChain] = useState<{
    prereqs: PrereqNode[];
    unlocks: PrereqNode[];
    loading: boolean;
  }>({ prereqs: [], unlocks: [], loading: false });
  const [calendarSyncStatus, setCalendarSyncStatus] = useState<
    "success" | "error" | null
  >(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [planName, setPlanName] = useState("My Plan");
  const [autosaveStatus, setAutosaveStatus] = useState<
    "saving" | "saved" | "error" | null
  >(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [savedPlanIds, setSavedPlanIds] = useState<SavedPlanIds | null>(null);

  const [courseGradeStats, setCourseGradeStats] =
    useState<CourseGradeStats | null>(null);
  const [isLoadingCourseGradeStats, setIsLoadingCourseGradeStats] =
    useState(false);
  const [courseGradeStatsError, setCourseGradeStatsError] = useState<
    string | null
  >(null);
  const [selectedSectionInstructor, setSelectedSectionInstructor] = useState<
    string | null
  >(null);
  const [showRmpModal, setShowRmpModal] = useState(false);
  const [rmpData, setRmpData] = useState<{
    name: string;
    department: string | null;
    rating: number | null;
    difficulty: number | null;
    num_ratings: number | null;
    would_take_again: number | null;
    tags: string[];
    rmp_url: string;
    error?: string;
  } | null>(null);
  const [isLoadingRmp, setIsLoadingRmp] = useState(false);
  const [departmentSearchQuery, setDepartmentSearchQuery] = useState("");

  const IDEAL_ROW_HEIGHT = 55;
  const MAX_SCHEDULE_HEIGHT = 500;

  // ── Time helpers ─────────────────────────────────────────────────────────

  const parseTimeToMinutes = (timeStr?: string | null) => {
    if (!timeStr) return 0;
    const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + parseInt(m[2], 10);
  };

  const formatHourLabel = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const getScheduleTimeRange = (data?: VisualizationItem[] | null) => {
    if (!data || data.length === 0) return { startHour: 8, endHour: 18 };
    let minMin = Infinity;
    let maxMin = -Infinity;
    data.forEach((item) => {
      if (item.startTime)
        minMin = Math.min(minMin, parseTimeToMinutes(item.startTime));
      if (item.endTime)
        maxMin = Math.max(maxMin, parseTimeToMinutes(item.endTime));
    });
    if (minMin === Infinity) return { startHour: 8, endHour: 18 };
    return {
      startHour: Math.max(0, Math.floor(minMin / 60) - 1),
      endHour: Math.ceil(maxMin / 60) + 1,
    };
  };

  // ── Calendar export helpers ───────────────────────────────────────────────

  const GOOGLE_TIME_ZONE = "America/Denver";

  const HARDCODED_UOFU_TERM_DATES: Record<
    number,
    Record<string, { start: Date; end: Date; label: string }>
  > = {
    2026: {
      spring: {
        start: new Date(2026, 0, 5, 0, 0, 0),
        end: new Date(2026, 3, 21, 23, 59, 59),
        label: "Spring 2026",
      },
      summer: {
        start: new Date(2026, 4, 11, 0, 0, 0),
        end: new Date(2026, 6, 29, 23, 59, 59),
        label: "Summer 2026",
      },
      fall: {
        start: new Date(2026, 7, 24, 0, 0, 0),
        end: new Date(2026, 11, 10, 23, 59, 59),
        label: "Fall 2026",
      },
    },
  };

  const normalizeTermKey = (term: string | undefined | null) => {
    if (!term) return null;
    const n = String(term).toLowerCase();
    if (n.includes("spring")) return "spring";
    if (n.includes("summer")) return "summer";
    if (n.includes("fall")) return "fall";
    return null;
  };

  const parseTermToMonth = (term: string | undefined | null) => {
    const n = normalizeTermKey(term);
    if (n === "spring") return 0;
    if (n === "summer") return 4;
    if (n === "fall") return 7;
    return 0;
  };

  const getHardcodedSemesterRange = (
    year: number,
    term: string | undefined | null,
  ) => {
    const termKey = normalizeTermKey(term);
    if (!termKey) return null;
    return HARDCODED_UOFU_TERM_DATES?.[year]?.[termKey] || null;
  };

  const getCurrentSemesterRange = (today = new Date()) => {
    for (const yearData of Object.values(HARDCODED_UOFU_TERM_DATES)) {
      for (const termData of Object.values(yearData)) {
        if (today >= termData.start && today <= termData.end) return termData;
      }
    }
    return null;
  };

  const getSemesterDateRange = () => {
    const explicitYear = Number(
      semester?.year ?? semester?.term_year ?? savedPlan?.term_year ?? NaN,
    );
    const explicitTerm =
      semester?.term ?? semester?.term_season ?? savedPlan?.term_season ?? "";
    const explicitRange = Number.isFinite(explicitYear)
      ? getHardcodedSemesterRange(explicitYear, explicitTerm)
      : null;
    if (explicitRange) return explicitRange;

    const currentRange = getCurrentSemesterRange(new Date());
    if (currentRange) return currentRange;

    const fallbackYear = Number.isFinite(explicitYear)
      ? explicitYear
      : new Date().getFullYear();
    const fallbackTerm = explicitTerm || planName || "";
    const startMonth = parseTermToMonth(fallbackTerm);
    return {
      start: new Date(fallbackYear, startMonth, 15, 0, 0, 0),
      end: new Date(fallbackYear, Math.min(startMonth + 4, 11), 15, 23, 59, 59),
      label: `${fallbackTerm || "Current"} ${fallbackYear}`.trim(),
    };
  };

  const dayNameToRRule: Record<string, string> = {
    Monday: "MO",
    Tuesday: "TU",
    Wednesday: "WE",
    Thursday: "TH",
    Friday: "FR",
    Saturday: "SA",
    Sunday: "SU",
  };

  const getNextOccurrenceForDay = (
    dayName: string,
    timeStr: string | undefined,
    referenceDate = new Date(),
  ) => {
    const dayOrder: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const targetDay = dayOrder[dayName];
    if (targetDay === undefined) return null;
    const minutes = parseTimeToMinutes(timeStr ?? "");
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const base = new Date(referenceDate);
    base.setHours(0, 0, 0, 0);
    const diff = (targetDay - base.getDay() + 7) % 7;
    base.setDate(base.getDate() + diff);
    base.setHours(hours, mins, 0, 0);
    if (base < referenceDate) base.setDate(base.getDate() + 7);
    return base;
  };

  const pad = (num: number) => String(num).padStart(2, "0");

  const toUntilUtcString = (dateObj: Date) => {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime()))
      return null;
    return `${dateObj.getUTCFullYear()}${pad(dateObj.getUTCMonth() + 1)}${pad(dateObj.getUTCDate())}T${pad(dateObj.getUTCHours())}${pad(dateObj.getUTCMinutes())}${pad(dateObj.getUTCSeconds())}Z`;
  };

  const formatICSDate = (dateObj: Date) => {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime()))
      return null;
    return `${dateObj.getUTCFullYear()}${pad(dateObj.getUTCMonth() + 1)}${pad(dateObj.getUTCDate())}T${pad(dateObj.getUTCHours())}${pad(dateObj.getUTCMinutes())}${pad(dateObj.getUTCSeconds())}Z`;
  };

  const escapeICS = (value = "") =>
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");

  const buildRecurringCourseEvents = (scheduleItems: VisualizationItem[]) => {
    if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return [];
    const grouped = new Map<string, VisualizationItem[]>();
    for (const item of scheduleItems) {
      const key = [
        item.class_ || "Untitled Course",
        item.startTime || "",
        item.endTime || "",
        item.room || "",
      ].join("|");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    const { start: semesterStart, end: semesterEnd } = getSemesterDateRange();
    const referenceDate =
      new Date() > semesterStart ? new Date() : semesterStart;
    const untilUtc = toUntilUtcString(semesterEnd);

    return Array.from(grouped.values())
      .map((items) => {
        const first = items[0];
        const rruleDays = Array.from(
          new Set(
            items.map((item) => dayNameToRRule[item.day ?? ""]).filter(Boolean),
          ),
        );
        const firstMeetingStart = getNextOccurrenceForDay(
          first.day ?? "",
          first.startTime,
          referenceDate,
        );
        if (!firstMeetingStart) return null;
        const durationMinutes = Math.max(
          30,
          parseTimeToMinutes(first.endTime) -
            parseTimeToMinutes(first.startTime),
        );
        const firstMeetingEnd = new Date(
          firstMeetingStart.getTime() + durationMinutes * 60000,
        );
        return {
          summary: first.class_ || "Course",
          location: first.room || "",
          description: `${first.class_ || "Course"} schedule exported from Advisor Chat`,
          startDate: firstMeetingStart,
          endDate: firstMeetingEnd,
          recurrenceRule:
            rruleDays.length && untilUtc
              ? `FREQ=WEEKLY;BYDAY=${rruleDays.join(",")};UNTIL=${untilUtc}`
              : "",
        };
      })
      .filter(Boolean) as {
      summary: string;
      location: string;
      description: string;
      startDate: Date;
      endDate: Date;
      recurrenceRule: string;
    }[];
  };

  const downloadICSFile = (
    events: {
      summary: string;
      location: string;
      description: string;
      startDate: Date;
      endDate: Date;
      recurrenceRule: string;
    }[],
  ) => {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Advisor Chat//Course Schedule Export//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeICS(planName || "Course Schedule")}`,
      `X-WR-TIMEZONE:${GOOGLE_TIME_ZONE}`,
    ];
    events.forEach((event, index) => {
      const dtStart = formatICSDate(event.startDate);
      const dtEnd = formatICSDate(event.endDate);
      if (!dtStart || !dtEnd) return;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${Date.now()}-${index}@advisor-chat`);
      lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
      lines.push(`SUMMARY:${escapeICS(event.summary)}`);
      lines.push(`DESCRIPTION:${escapeICS(event.description || "")}`);
      if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      if (event.recurrenceRule) lines.push(`RRULE:${event.recurrenceRule}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName =
      (planName || "course-schedule")
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "course-schedule";
    anchor.href = url;
    anchor.download = `${safeName}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadCalendarFile = () => {
    if (!visualizationData?.data?.length)
      return alert("No schedule available to export.");
    const events = buildRecurringCourseEvents(visualizationData.data);
    if (!events.length)
      return alert(
        "Could not build calendar events from the current schedule.",
      );
    try {
      downloadICSFile(events);
      setCalendarSyncStatus("success");
      setTimeout(() => setCalendarSyncStatus(null), 2500);
    } catch (err) {
      console.error("[Calendar Export] .ics download failed:", err);
      setCalendarSyncStatus("error");
      alert(
        `Calendar export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  // ── Course detail / prereq chain ──────────────────────────────────────────

  const handleBrowseDepartmentSelect = (dept: string) => {
    setBrowserDepartmentFilter(dept);
    setSelectedDepartment(dept); // optional: sync with Add Course dropdown too
    setCourseSearchQuery("");
  };

  const handleBackToDepartments = () => {
    setBrowserDepartmentFilter("");
    setCourseSearchQuery("");
  };

  const openCourseDetails = async (course: Course) => {
    setSelectedCourse(course);
    setShowCourseDetailModal(true);
    setPrereqChain({ prereqs: [], unlocks: [], loading: true });

    try {
      let fullCourse: Record<string, unknown> | null = null;
      if (course.department && course.course_code) {
        const r = await fetch(
          `${BASE_URL}/courses/by-code?subject=${encodeURIComponent(course.department)}&number=${encodeURIComponent(course.course_code)}`,
        );
        if (r.ok) fullCourse = await r.json();
      }

      const conditions: unknown[] =
        (fullCourse?.prereq_conditions as unknown[]) || [];
      const prereqs: PrereqNode[] = conditions.map((cond, i) => {
        let label = String(cond);
        label = label.replace(/([A-Za-z]+)(\d)/, "$1 $2");
        return { id: i, label };
      });

      const dept = (course.department || "").toUpperCase();
      const code = (course.course_code || "").toString();
      const courseKeyWithSpace = `${dept} ${code}`;
      const courseKeyNoSpace = `${dept}${code}`;

      let coursesWithPrereqs: Record<string, unknown>[] = [];
      try {
        const r = await fetch(`${BASE_URL}/courses/`);
        if (r.ok) coursesWithPrereqs = await r.json();
      } catch (_) {}

      const unlocks: PrereqNode[] = coursesWithPrereqs
        .filter((c) => {
          if (!Array.isArray(c.prereq_conditions)) return false;
          return (c.prereq_conditions as unknown[]).some((cond) => {
            const condStr = String(cond).toUpperCase();
            const condNoSpaces = condStr.replace(/\s+/g, "");
            return (
              condStr.includes(courseKeyWithSpace) ||
              condNoSpaces.includes(courseKeyNoSpace) ||
              (dept && code && condStr.includes(code) && condStr.includes(dept))
            );
          });
        })
        .map((c) => {
          const unlockNum = String(c.number || "");
          let unlockDept = "";

          if (
            c.department &&
            typeof c.department === "object" &&
            (c.department as Record<string, unknown>).subject
          ) {
            unlockDept = String(
              (c.department as Record<string, unknown>).subject,
            );
          } else if (c.department && typeof c.department === "string") {
            unlockDept = c.department;
          } else if (c.subject && typeof c.subject === "string") {
            unlockDept = c.subject;
          } else {
            const matchingCourse = allCourses.find(
              (ac) => ac.id === (c.id as number),
            );
            if (matchingCourse?.department) {
              unlockDept = matchingCourse.department;
            } else {
              unlockDept = course.department || "";
            }
          }

          const label = unlockDept
            ? `${unlockDept} ${unlockNum}`.trim()
            : unlockNum;
          return { id: c.id as number, label };
        });

      setPrereqChain({ prereqs, unlocks, loading: false });
    } catch (e) {
      console.warn("[openCourseDetails] failed:", e);
      setPrereqChain({ prereqs: [], unlocks: [], loading: false });
    }
  };

  const closeCourseDetails = () => {
    setShowCourseDetailModal(false);
    setShowGradeDistributionModal(false);
    setSelectedCourse(null);
    setPrereqChain({ prereqs: [], unlocks: [], loading: false });
    setCourseGradeStats(null);
    setCourseGradeStatsError(null);
    setSelectedSectionInstructor(null);
  };

  const openGradeDistributionModal = async () => {
    if (!selectedCourse) return;
    setShowGradeDistributionModal(true);
    await loadCourseGradeStats(selectedCourse);
  };

  const closeGradeDistributionModal = () => {
    setShowGradeDistributionModal(false);
    setCourseGradeStats(null);
    setCourseGradeStatsError(null);
  };

  const handleViewRmp = async () => {
    if (!selectedSectionInstructor) return;
    setIsLoadingRmp(true);
    setShowRmpModal(true);
    try {
      const data = await fetchProfessorRating(selectedSectionInstructor);
      setRmpData(data);
    } catch (e) {
      console.error("RMP fetch failed:", e);
      setRmpData(null);
    } finally {
      setIsLoadingRmp(false);
    }
  };

  const loadCourseGradeStats = async (course: Course) => {
    if (!course?.department || !course?.course_code) {
      setCourseGradeStats(null);
      setCourseGradeStatsError("Missing course info");
      return;
    }
    setIsLoadingCourseGradeStats(true);
    setCourseGradeStatsError(null);
    try {
      const stats = await fetchCourseGradeStatsRequest(
        course.department,
        course.course_code,
      );
      setCourseGradeStats(stats);
    } catch (err) {
      console.error("Failed to load course grade stats:", err);
      setCourseGradeStats(null);
      setCourseGradeStatsError(
        err instanceof Error ? err.message : "Failed to load grade stats",
      );
    } finally {
      setIsLoadingCourseGradeStats(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  const warmupDoneRef = useRef(false);

  useEffect(() => {
    if (courseCatalog && courseCatalog.length > 0) {
      setAllCourses(courseCatalog);
      setIsLoadingCourses(false);
    }
  }, [courseCatalog]);

  useEffect(() => {
    setIsLoadingCourses(
      isCourseCatalogLoading && (!courseCatalog || courseCatalog.length === 0),
    );
  }, [isCourseCatalogLoading, courseCatalog]);

  useEffect(() => {
    if (warmupDoneRef.current) return;
    warmupDoneRef.current = true;
    void (async () => {
      try {
        await sendMessageLLM("Warmup. Reply with OK.", () => {});
      } catch (e) {
        console.log(
          "Warmup failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    })();
  }, []);

  const userEditedNameRef = useRef(false);
  useEffect(() => {
    if (!userEditedNameRef.current) return;
    if (!isAutosaveMode) return;
    const timer = setTimeout(() => {
      void autosave(messages, visualizationData);
    }, 1000);
    return () => clearTimeout(timer);
  }, [planName]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  useEffect(() => {
    const onSubmit = (e: Event) => {
      console.log("FORM SUBMIT CAUGHT", e.target);
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    if (!savedPlan) return;
    setPlanName(savedPlan.name || "My Plan");
    setMessages(
      savedPlan.messages?.length && savedPlan.messages.length > 0
        ? savedPlan.messages
        : [
            {
              role: "assistant",
              content: "Plan loaded. No previous chat history.",
            },
          ],
    );
    setVisualizationData(
      savedPlan.schedule?.length && savedPlan.schedule.length > 0
        ? { type: "schedule", data: savedPlan.schedule }
        : null,
    );
  }, [savedPlan]);

  const semesterInitializedRef = useRef(false);
  useEffect(() => {
    if (!semester || semesterInitializedRef.current) return;
    semesterInitializedRef.current = true;
    setPlanName(semester.name || semester._planTitle || "My Plan");
    setMessages(
      semester.messages?.length && semester.messages.length > 0
        ? semester.messages
        : [
            {
              role: "assistant",
              content:
                "I am your class advisor, please submit your degree audit by pressing the + button! (ONLY HTML)",
            },
          ],
    );
    setVisualizationData(
      semester.schedule?.length && semester.schedule.length > 0
        ? { type: "schedule", data: semester.schedule }
        : null,
    );
  }, [semester]);

  const isFreshMultiMode = !!(
    semester &&
    !semester.plan_id &&
    (semester._allSemesters || semester._existingPlanId)
  );
  const isAutosaveMode =
    !!(semester?.plan_id && semester?.semester_db_id) ||
    isFreshMultiMode ||
    !!(savedPlan?.id && savedPlan?.semester_db_id) ||
    !!savedPlanIds;

  const isAutosaveModeRef = useRef(isAutosaveMode);
  useEffect(() => {
    isAutosaveModeRef.current = isAutosaveMode;
  }, [isAutosaveMode]);

  const createdPlanRef = useRef<SavedPlanIds | null>(null);
  const isCreatingPlanRef = useRef(false);

  useEffect(() => {
    if (!semester?._existingPlanId || !userData?.id || createdPlanRef.current)
      return;

    const existingPlanId = semester._existingPlanId;
    const userId = userData.id;
    const term = semester.term || "Fall";
    const year = semester.year || new Date().getFullYear();

    const registerSemester = async () => {
      if (isCreatingPlanRef.current) return;
      isCreatingPlanRef.current = true;
      try {
        const data = await createSemesterForPlanRequest(
          existingPlanId,
          userId,
          term,
          year,
        );
        const ids: SavedPlanIds = {
          plan_id: existingPlanId,
          semester_db_id: data.semester_db_id,
        };
        createdPlanRef.current = ids;
        if (onPlanCreated) onPlanCreated(ids);
      } catch (e) {
        console.error("[ChatUI] failed to register semester on mount:", e);
      } finally {
        isCreatingPlanRef.current = false;
      }
    };

    void registerSemester();
  }, []);

  console.log(
    "[ChatUI] semester:",
    semester,
    "isAutosaveMode:",
    isAutosaveMode,
    "isFreshMultiMode:",
    isFreshMultiMode,
  );

  // ── Plan ID helpers ───────────────────────────────────────────────────────

  const getActivePlanIds = (): SavedPlanIds | null => {
    if (semester?.plan_id && semester?.semester_db_id)
      return {
        plan_id: semester.plan_id,
        semester_db_id: semester.semester_db_id,
      };
    if (createdPlanRef.current) return createdPlanRef.current;
    if (savedPlanIds) return savedPlanIds;
    if (savedPlan?.id && savedPlan?.semester_db_id)
      return {
        plan_id: savedPlan.id,
        semester_db_id: savedPlan.semester_db_id,
      };
    return null;
  };

  const createFreshMultiPlan = async (): Promise<SavedPlanIds> => {
    if (!userData?.id) throw new Error("User not loaded");
    const allSemesters = semester?._allSemesters || [];
    const planTitle = semester?._planTitle || "Multi-Semester Plan";
    const thisSemesterIndex = allSemesters.findIndex(
      (s) => s.id === semester?.id,
    );
    let planId = semester?._existingPlanId || null;
    let semesterDbId: number | string | undefined | null = null;

    if (!planId) {
      const created = await createMultiPlanRequest(
        userData.id,
        planTitle,
        allSemesters.map((s) => ({
          term_season: s.term,
          term_year: s.year,
          courses: s.courses || [],
        })),
      );
      planId = created.id;
      const detail = await fetchMultiPlanDetailRequest(userData.id, planId);
      semesterDbId = detail.semesters[thisSemesterIndex]?.id;
      if (onPlanSaved) onPlanSaved();
    } else {
      if (createdPlanRef.current) return createdPlanRef.current;
      const data = await createSemesterForPlanRequest(
        planId,
        userData.id,
        semester?.term || "Fall",
        semester?.year || new Date().getFullYear(),
      );
      semesterDbId = data.semester_db_id;
    }

    if (!semesterDbId) throw new Error("Could not resolve semester DB id");
    const ids = { plan_id: planId, semester_db_id: semesterDbId };
    createdPlanRef.current = ids;
    if (onPlanCreated)
      onPlanCreated({ plan_id: planId, semester_db_id: semesterDbId });
    return ids;
  };

  // ── Autosave ──────────────────────────────────────────────────────────────

  const autosave = async (
    msgs: ChatMessage[],
    vizData: VisualizationData | null,
  ) => {
    if (!isAutosaveModeRef.current || !userData?.id) return;
    setAutosaveStatus("saving");
    try {
      let ids = getActivePlanIds();
      if (!ids) {
        if (isCreatingPlanRef.current) return;
        isCreatingPlanRef.current = true;
        try {
          ids = await createFreshMultiPlan();
        } finally {
          isCreatingPlanRef.current = false;
        }
      }

      const courseSelections: Array<{
        course_id: number | string;
        class_section_id: number | string | null;
      }> = [];
      const seen = new Set<string>();

      (vizData?.data || []).forEach((item) => {
        if (!item.course_id) return;
        const key = `${item.course_id}-${item.class_section_id || "null"}`;
        if (!seen.has(key)) {
          seen.add(key);
          courseSelections.push({
            course_id: item.course_id,
            class_section_id: item.class_section_id || null,
          });
        }
      });

      await autosaveSemesterRequest(ids, {
        user_id: userData.id,
        plan_name:
          (semester && (semester._planTitle || semester.name)) ||
          planName ||
          null,
        courseSelections,
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
        schedule: (vizData?.data || []).map((item) => ({
          class_: item.class_ || "",
          day: item.day || "",
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          room: item.room || "",
          course_id: item.course_id || null,
          class_section_id: item.class_section_id || null,
          instructor: (item.instructor as string | null) || null,
        })),
      });

      setAutosaveStatus("saved");
      setTimeout(() => setAutosaveStatus(null), 2000);
      if (onPlanSaved) onPlanSaved();
    } catch (err) {
      console.error("[autosave] error:", err);
      setAutosaveStatus("error");
    }
  };

  // ── File / message handlers ───────────────────────────────────────────────

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadedFiles((prev) => [
      ...prev,
      {
        name: file.name,
        size: (file.size / 1024).toFixed(2) + " KB",
        type: file.type,
      },
    ]);
    try {
      const schedule = await uploadAuditFile(file);
      const newVizData: VisualizationData = {
        type: "schedule",
        data: schedule,
      };
      setVisualizationData(newVizData);
      if (isAutosaveModeRef.current) {
        let latestMsgs: ChatMessage[] = [];
        setMessages((prev) => {
          latestMsgs = prev;
          return prev;
        });
        setTimeout(() => {
          void autosave(latestMsgs, newVizData);
        }, 100);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load schedule from backend");
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);

    const appendToken = (t: string) => {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: copy[copy.length - 1].content + t,
        };
        return copy;
      });
    };

    let finalMessages: ChatMessage[] = [];
    try {
      await sendMessageLLM(userMessage, appendToken);
      await new Promise<void>((resolve) => {
        setMessages((prev) => {
          finalMessages = prev;
          resolve();
          return prev;
        });
      });
      if (isAutosaveModeRef.current)
        await autosave(finalMessages, visualizationData);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleRightPanel = () => setIsRightPanelExpanded(!isRightPanelExpanded);

  // ── Course helpers ────────────────────────────────────────────────────────

  const parseDayAbbreviations = (dayStr: string) => {
    const dayMap: Record<string, string> = {
      Mo: "Monday",
      Tu: "Tuesday",
      We: "Wednesday",
      Th: "Thursday",
      Fr: "Friday",
      Sa: "Saturday",
      Su: "Sunday",
    };
    const days: string[] = [];
    for (let i = 0; i < dayStr.length; i += 2) {
      const abbr = dayStr.substring(i, i + 2);
      if (dayMap[abbr]) days.push(dayMap[abbr]);
    }
    return days;
  };

  const formatSectionTypeLabel = (value?: string | null) => {
    const upper = (value || "").toUpperCase().trim();

    if (!upper) return null;
    if (upper.includes("LECTURE") || upper === "LEC") return "Lecture";
    if (upper.includes("LAB")) return "Lab";
    if (upper.includes("DISCUSSION") || upper === "DIS") return "Discussion";
    if (upper.includes("SEMINAR") || upper === "SEM") return "Seminar";
    if (upper.includes("TUTORIAL") || upper === "TUT") return "Tutorial";

    return value;
  };

  const handleAddCourse = async () => {
    if (!class_code.trim()) {
      alert("Please enter a class code");
      return;
    }
    try {
      const sections = await fetchCourseSectionsRequest(
        class_code,
        selectedDepartment || undefined,
      );
      if (sections.length === 0) {
        alert(
          `No sections found for course code "${class_code}". Make sure you're entering just the number (e.g. 1410).`,
        );
        return;
      }
      setAvailableSections(sections);
      setShowSectionModal(true);
    } catch (err) {
      console.error("handleAddCourse error:", err);
      alert(
        `Failed to add course: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleSelectSection = async (section: Section) => {
    const days = parseDayAbbreviations(section.day);
    let courseId = section.course_id || null;
    const classSectionId = section.class_section_id || section.id || null;

    if (!courseId) {
      const match = section.class_?.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        const courseCode = match[1];
        let course = allCourses.find(
          (c) => c.course_code.toString() === courseCode,
        );
        if (!course) {
          try {
            const courses = await fetchAllCoursesRequest();
            setAllCourses(courses);
            course = courses.find(
              (c) => c.course_code.toString() === courseCode,
            );
          } catch (e) {
            console.warn("[handleSelectSection] failed to fetch courses:", e);
          }
        }
        if (course) courseId = course.id || null;
      }
    }

    if (!courseId)
      console.warn(
        "[handleSelectSection] could not resolve course_id for section:",
        section,
      );

    const newEntries: VisualizationItem[] = days.map((day) => ({
      ...section,
      day,
      course_id: courseId,
      class_section_id: classSectionId,
      instructor:
        section.instructor ||
        ((section as Record<string, unknown>)["professor_name"] as
          | string
          | null) ||
        null,
    }));

    const newVizData = visualizationData
      ? {
          ...visualizationData,
          data: [...visualizationData.data, ...newEntries],
        }
      : { type: "schedule" as const, data: newEntries };

    setVisualizationData(newVizData);

    if (isAutosaveModeRef.current) {
      let latestMsgs: ChatMessage[] = [];
      setMessages((prev) => {
        latestMsgs = prev;
        return prev;
      });
      setTimeout(() => {
        void autosave(latestMsgs, newVizData);
      }, 0);
    }

    setShowSectionModal(false);
    setAvailableSections([]);
    setClass_code("");
  };

  const closeModal = () => {
    setShowSectionModal(false);
    setAvailableSections([]);
  };

  const fetchAllCourses = async () => {
    setIsLoadingCourses(true);
    try {
      const courses = await fetchAllCoursesRequest();
      setAllCourses(courses);
    } catch (err) {
      console.error("Error fetching courses:", err);
      alert(
        `Failed to load courses: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const toggleCoursesPanel = () => {
    if (!showCoursesPanel && allCourses.length === 0) void fetchAllCourses();
    setShowCoursesPanel(!showCoursesPanel);
  };

  const handleCourseClick = (course: Course) => {
    setShowCoursesPanel(false);
    void openCourseDetails(course);
  };

  const fetchCourseSections = async (courseCode: string | number) => {
    try {
      const sections = await fetchCourseSectionsRequest(String(courseCode));
      setAvailableSections(sections);
      setShowSectionModal(true);
    } catch (err) {
      console.error(err);
      alert(
        `Failed to add course: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  void fetchCourseSections;

  const handleScheduleItemClick = (scheduleItem: VisualizationItem) => {
    const courseCodeMatch = scheduleItem.class_?.match(/(\d+)/);
    if (!courseCodeMatch) return;
    const courseCode = courseCodeMatch[1];
    const deptMatch = scheduleItem.class_?.match(/^([A-Z]+)\s/);
    const dept = deptMatch ? deptMatch[1] : selectedDepartment || "Unknown";

    const course =
      allCourses.find(
        (c) =>
          c.course_code.toString() === courseCode &&
          c.department.toUpperCase() === dept.toUpperCase(),
      ) || allCourses.find((c) => c.course_code.toString() === courseCode);

    void openCourseDetails(
      course ?? {
        department: dept,
        course_code: courseCode,
        course_name: scheduleItem.class_ || "",
        credits: "N/A",
        description:
          "Course details not available. Please check the course catalog.",
      },
    );
    setSelectedSectionInstructor(
      (scheduleItem.instructor as string | null) || null,
    );
  };

  const handleDeleteCourse = (
    e: MouseEvent<HTMLButtonElement>,
    scheduleItem: VisualizationItem,
  ) => {
    e.stopPropagation();
    const updatedData =
      visualizationData?.data.filter(
        (item) => item.class_ !== scheduleItem.class_,
      ) || [];
    const newVizData =
      updatedData.length === 0
        ? null
        : { ...visualizationData!, data: updatedData };
    setVisualizationData(newVizData);
    if (isAutosaveModeRef.current) {
      let latestMsgs: ChatMessage[] = [];
      setMessages((prev) => {
        latestMsgs = prev;
        return prev;
      });
      setTimeout(() => {
        void autosave(latestMsgs, newVizData);
      }, 0);
    }
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const browserDepartments = [
    ...new Set(allCourses.map((c) => c.department).filter(Boolean)),
  ].sort();

  const filteredBrowserDepartments = browserDepartments.filter((dept) =>
    dept.toLowerCase().includes(departmentSearchQuery.toLowerCase().trim()),
  );

  const groupedBrowserDepartments = filteredBrowserDepartments.reduce(
    (acc, dept) => {
      const firstLetter = dept.trim().charAt(0).toUpperCase();
      const groupKey = /[A-Z]/.test(firstLetter) ? firstLetter : "#";

      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(dept);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const groupedDepartmentLetters = Object.keys(
    groupedBrowserDepartments,
  ).sort();

  const isInitialCourseLoad = isLoadingCourses && allCourses.length === 0;
  const filteredCourses = !browserDepartmentFilter
    ? []
    : allCourses.filter((course) => {
        if (course.department !== browserDepartmentFilter) return false;

        const searchLower = courseSearchQuery.toLowerCase().trim();
        const combined =
          `${course.department} ${course.course_code} ${course.course_name}`.toLowerCase();

        return (
          !searchLower ||
          combined.includes(searchLower) ||
          (!!course.description &&
            course.description.toLowerCase().includes(searchLower))
        );
      });

  // ── Save plan ─────────────────────────────────────────────────────────────

  const handleSavePlan = async () => {
    try {
      if (!userData?.id) {
        alert("User not loaded");
        return;
      }

      const scheduleItems = visualizationData?.data || [];
      const payload = {
        user_id: userData.id,
        name: planName,
        semester: {
          term_season: semester?.term_season || "Fall",
          term_year: semester?.term_year || new Date().getFullYear(),
        },
        courseSelections: [] as Array<{
          course_id: number | string;
          class_section_id: number | string | null;
        }>,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        schedule: scheduleItems.map((item) => ({
          class_: item.class_ || "",
          day: item.day || "",
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          room: item.room || "",
          course_id: item.course_id || null,
          class_section_id: item.class_section_id || null,
          instructor: (item.instructor as string | null) || null,
        })),
      };

      if (scheduleItems.length > 0) {
        const seen = new Set<string>();
        scheduleItems.forEach((item) => {
          if (!item.course_id) return;
          const key = `${item.course_id}-${item.class_section_id || "null"}`;
          if (!seen.has(key)) {
            seen.add(key);
            payload.courseSelections.push({
              course_id: item.course_id,
              class_section_id: item.class_section_id || null,
            });
          }
        });
      }

      const data = await saveSinglePlanRequest(payload);

      if (data.id && data.semester_db_id) {
        setSavedPlanIds({
          plan_id: data.id,
          semester_db_id: data.semester_db_id,
        });
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      if (onPlanSaved) onPlanSaved(data.id);
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving plan");
    }
  };

  // ── Section conflict check ────────────────────────────────────────────────

  const getSectionConflict = (section: Section) => {
    const toMinutes = (timeStr: string) => {
      const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return 0;

      let h = parseInt(m[1], 10);
      if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (m[3].toUpperCase() === "AM" && h === 12) h = 0;

      return h * 60 + parseInt(m[2], 10);
    };

    const normalizeSectionType = (value?: string | null) => {
      const upper = (value || "").toUpperCase().trim();

      if (!upper) return null;
      if (upper.includes("LAB")) return "LAB";
      if (upper.includes("LECTURE") || upper.includes("LEC")) return "LEC";
      if (upper.includes("DISCUSSION") || upper.includes("DIS")) return "DIS";
      if (upper.includes("SEMINAR") || upper.includes("SEM")) return "SEM";
      if (upper.includes("TUTORIAL") || upper.includes("TUT")) return "TUT";

      return upper;
    };

    const getSectionId = (item: Section | VisualizationItem) =>
      item.class_section_id ?? item.id ?? null;

    const getCourseKey = (item: Section | VisualizationItem) => {
      if (item.course_id != null) return `course-${item.course_id}`;

      const match = item.class_?.match(/^([A-Z]+)\s+(\d+)/i);
      if (!match) return null;
      return `${match[1].toUpperCase()}-${match[2]}`;
    };

    const reasons: string[] = [];

    const newSectionId = getSectionId(section);
    const newCourseKey = getCourseKey(section);
    const newType = normalizeSectionType(section.section_type);

    // exact same section already added
    if (newSectionId != null) {
      const exactDuplicate = (visualizationData?.data || []).find(
        (item) => getSectionId(item) === newSectionId,
      );

      if (exactDuplicate) {
        reasons.push(`Already added (${exactDuplicate.class_})`);
      }
    }

    // same course + same section type already added
    if (newCourseKey && newType) {
      const duplicateType = (visualizationData?.data || []).find((item) => {
        const existingCourseKey = getCourseKey(item);
        const existingType = normalizeSectionType(
          (item.section_type as string | null | undefined) ?? null,
        );

        return existingCourseKey === newCourseKey && existingType === newType;
      });

      if (duplicateType) {
        if (newType === "LAB") {
          reasons.push(
            `A lab is already on schedule for this course (${duplicateType.class_})`,
          );
        } else if (newType === "LEC") {
          reasons.push(
            `A lecture is already on schedule for this course (${duplicateType.class_})`,
          );
        } else if (newType === "DIS") {
          reasons.push(
            `A discussion is already on schedule for this course (${duplicateType.class_})`,
          );
        } else {
          reasons.push(
            `A ${newType.toLowerCase()} section is already on schedule for this course (${duplicateType.class_})`,
          );
        }
      }
    }

    // actual time conflicts
    const days = parseDayAbbreviations(section.day);
    const conflictsByClass: Record<string, string[]> = {};

    for (const day of days) {
      const conflicting = (visualizationData?.data || []).filter((existing) => {
        if (existing.day !== day) return false;

        const existingSectionId = getSectionId(existing);
        if (
          newSectionId != null &&
          existingSectionId != null &&
          newSectionId === existingSectionId
        ) {
          return false;
        }

        const existStart = toMinutes(existing.startTime || "");
        const existEnd = toMinutes(existing.endTime || "");
        const newStart = toMinutes(section.startTime);
        const newEnd = toMinutes(section.endTime);

        return newStart < existEnd && newEnd > existStart;
      });

      for (const c of conflicting) {
        const className = c.class_ || "Unknown";
        if (!conflictsByClass[className]) conflictsByClass[className] = [];
        conflictsByClass[className].push(day);
      }
    }

    for (const [className, classDays] of Object.entries(conflictsByClass)) {
      reasons.push(`Conflicts with ${className} on ${classDays.join(", ")}`);
    }

    return reasons.length > 0 ? reasons : null;
  };

  // ── Schedule grid setup ───────────────────────────────────────────────────

  const titleInputStyle = `
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

  const scheduleRange = visualizationData
    ? getScheduleTimeRange(visualizationData.data)
    : null;
  const scheduleStartHour = scheduleRange?.startHour ?? 8;
  const scheduleEndHour = scheduleRange?.endHour ?? 18;
  const scheduleTotalHours = scheduleEndHour - scheduleStartHour;

  const rowHeight =
    scheduleTotalHours > 0
      ? Math.min(
          IDEAL_ROW_HEIGHT,
          Math.floor(MAX_SCHEDULE_HEIGHT / scheduleTotalHours),
        )
      : IDEAL_ROW_HEIGHT;

  const scheduleGridHeight = scheduleTotalHours * rowHeight;

  const hourLabels: number[] = [];
  for (let h = scheduleStartHour; h <= scheduleEndHour; h++) hourLabels.push(h);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-slate-100 relative">
      <style>{titleInputStyle}</style>

      {/* ── Left panel: AI advisor chat ── */}
      <div
        className={`flex flex-col border-r border-slate-300 bg-white transition-all duration-500 ease-in-out overflow-hidden ${
          isRightPanelExpanded ? "w-0" : "w-1/3"
        }`}
      >
        <header
          className="border-b border-slate-200 px-6 py-4 h-16 flex items-center shadow-sm"
          style={{ backgroundColor: "#BE0000" }}
        >
          <div className="flex items-center gap-3">
            {(isAutosaveMode || isFreshMultiMode) && (
              <button
                type="button"
                onClick={() =>
                  onBack({
                    messages,
                    schedule: visualizationData?.data || [],
                    planName: semester?._planTitle || null,
                  })
                }
                className="flex items-center gap-1 text-white opacity-80 hover:opacity-100 transition-opacity"
                title="Back to semester overview"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="text-sm font-medium">Back</span>
              </button>
            )}
            <h1 className="text-xl font-semibold text-white">Advisor Chat</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-3">
            {messages.map((message, index) => {
              if (!message.content) return null;
              return (
                <div
                  key={index}
                  className={`flex gap-2 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 flex items-center justify-center shadow-sm text-white text-xs font-bold">
                      AI
                    </div>
                  )}
                  <div
                    className={`max-w-md rounded-xl px-3 py-2 shadow-sm text-sm ${
                      message.role === "user"
                        ? "text-white"
                        : "bg-slate-50 text-slate-800 border border-slate-200"
                    }`}
                    style={
                      message.role === "user"
                        ? { backgroundColor: "#BE0000" }
                        : {}
                    }
                  >
                    <p className="whitespace-pre-wrap leading-snug">
                      {message.content}
                    </p>
                  </div>
                  {message.role === "user" && message.content && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shadow-sm text-white text-sm">
                      👤
                    </div>
                  )}
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 bg-white">
          <div>
            <div className="relative flex items-center gap-3 bg-slate-50 rounded-full border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-[#BE0000]/50 transition-all">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-all text-sm font-bold"
                title="Upload file"
              >
                +
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept=".txt,.pdf,.doc,.docx,.csv,.html"
              />
              <input
                ref={textareaRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here..."
                className="flex-1 bg-transparent px-2 py-1 outline-none text-slate-800 placeholder-slate-400"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-lg"
                style={{ backgroundColor: "#BE0000" }}
              >
                ➤
              </button>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 flex items-center gap-1 bg-slate-100 rounded px-2 py-1 border border-slate-200"
                  >
                    <span style={{ fontSize: "10px" }}>📄</span>
                    <span className="text-xs text-slate-700 max-w-32 truncate">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-500 text-xs ml-0.5"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right panel: Schedule grid + course tools ── */}
      <div
        className={`flex flex-col bg-slate-50 transition-all duration-500 ease-in-out ${
          isRightPanelExpanded ? "w-full" : "w-2/3"
        }`}
      >
        <header
          className="border-b border-slate-200 px-6 py-4 h-16 flex items-center justify-between shadow-sm"
          style={{ backgroundColor: "#BE0000" }}
        >
          <div className="flex items-center gap-4">
            <div className="relative group">
              <input
                type="text"
                value={planName}
                onChange={(e) => {
                  userEditedNameRef.current = true;
                  setPlanName(e.target.value);
                }}
                className="plan-title-input bg-transparent text-white font-semibold text-xl border-none focus:outline-none focus:ring-0 transition-all pr-8"
                style={{
                  minWidth: "150px",
                  caretColor: "white",
                  WebkitAppearance: "none",
                  boxShadow: "none",
                }}
                placeholder="Enter plan name"
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
            <button
              type="button"
              onClick={() =>
                window.open(REGISTRATION_URL, "_blank", "noopener,noreferrer")
              }
              className="px-3 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
              style={{ color: "#BE0000" }}
            >
              University Registration
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pl-4 pr-6 py-6 space-y-6 relative">
          {/* ── Slide-out course browser panel ── */}
          <div
            className={`fixed top-16 right-0 h-[calc(100vh-4rem)] bg-white shadow-2xl transition-transform duration-300 ease-in-out z-20 ${
              showCoursesPanel ? "translate-x-0" : "translate-x-full"
            }`}
            style={{ width: "420px" }}
          >
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  {!browserDepartmentFilter ? (
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">
                        Choose Department
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select a department first, then browse its courses
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBackToDepartments}
                        className="w-8 h-8 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 transition-all"
                        title="Back to departments"
                      >
                        ←
                      </button>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">
                          {browserDepartmentFilter} Courses
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Browse and search within this department
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={toggleCoursesPanel}
                    className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none"
                  >
                    ×
                  </button>
                </div>

                {!browserDepartmentFilter ? (
                  <input
                    type="text"
                    value={departmentSearchQuery}
                    onChange={(e) => setDepartmentSearchQuery(e.target.value)}
                    placeholder="Search departments..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 text-sm"
                  />
                ) : (
                  <>
                    <input
                      type="text"
                      value={courseSearchQuery}
                      onChange={(e) => setCourseSearchQuery(e.target.value)}
                      placeholder={`Search ${browserDepartmentFilter} courses...`}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 text-sm"
                    />
                    <div className="mt-2">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: "#BE0000" }}
                      >
                        {browserDepartmentFilter}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {isLoadingCourses ? (
                  <div className="text-center py-8 text-slate-500">
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2"
                      style={{ borderColor: "#BE0000" }}
                    />
                    <p>Loading courses...</p>
                  </div>
                ) : !browserDepartmentFilter ? (
                  groupedDepartmentLetters.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">
                      No departments match your search
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {groupedDepartmentLetters.map((letter) => (
                        <div key={letter}>
                          <div className="mb-2">
                            <h4 className="text-xl font-semibold text-slate-800 underline underline-offset-2">
                              {letter}
                            </h4>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {groupedBrowserDepartments[letter].map((dept) => (
                              <button
                                key={dept}
                                type="button"
                                onClick={() =>
                                  handleBrowseDepartmentSelect(dept)
                                }
                                className="text-left px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-all"
                              >
                                {dept}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : filteredCourses.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No courses match your search in {browserDepartmentFilter}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredCourses.map((course, index) => (
                      <div
                        key={index}
                        onClick={() => handleCourseClick(course)}
                        className="border border-slate-200 rounded-lg p-3 hover:border-red-700 hover:bg-slate-50 cursor-pointer transition-all"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-semibold text-slate-800 text-sm">
                            {course.department} {course.course_code}
                          </h4>
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {course.credits} credits
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium mb-1">
                          {course.course_name}
                        </p>
                        {course.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Weekly schedule grid ── */}
          {visualizationData && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="text-base font-semibold text-slate-800">
                  Weekly Class Schedule
                </h3>
                <button
                  type="button"
                  onClick={handleDownloadCalendarFile}
                  className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-all shadow-sm border"
                  style={{
                    backgroundColor: "white",
                    color: "#BE0000",
                    borderColor: "#BE0000",
                  }}
                >
                  {calendarSyncStatus === "success"
                    ? "✓ Downloaded calendar file"
                    : "Download calendar (.ics)"}
                </button>
              </div>
              {calendarSyncStatus === "error" && (
                <p className="text-sm text-red-600 mb-3">
                  Could not export the calendar file. Please try again.
                </p>
              )}
              <div className="w-full">
                <div className="flex gap-1 mb-1">
                  <div style={{ width: "45px", flexShrink: 0 }} />
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                    <div
                      key={day}
                      className="flex-1 text-sm font-semibold text-slate-600 text-center py-1"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div
                  className="relative overflow-hidden"
                  style={{ height: `${scheduleGridHeight}px` }}
                >
                  <div className="absolute inset-0">
                    {hourLabels.map((hour, i) => (
                      <div
                        key={hour}
                        className="flex gap-1 absolute w-full"
                        style={{
                          top: `${i * rowHeight}px`,
                          height: `${rowHeight}px`,
                        }}
                      >
                        <div
                          className="text-slate-400 text-right pr-3 leading-none whitespace-nowrap"
                          style={{
                            fontSize: "10px",
                            width: "45px",
                            flexShrink: 0,
                          }}
                        >
                          {formatHourLabel(hour)}
                        </div>
                        {[
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                        ].map((day) => (
                          <div
                            key={`${day}-${hour}`}
                            className="flex-1 border-t border-slate-200 bg-slate-50"
                            style={{ height: `${rowHeight}px` }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="flex gap-1 h-full">
                      <div style={{ width: "45px", flexShrink: 0 }} />
                      {[
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                      ].map((day) => (
                        <div key={day} className="flex-1 relative">
                          {visualizationData.data
                            .filter((item) => item.day === day)
                            .map((classItem, idx) => {
                              const startMinutes = parseTimeToMinutes(
                                classItem.startTime,
                              );
                              const endMinutes = parseTimeToMinutes(
                                classItem.endTime,
                              );
                              const topOffset =
                                ((startMinutes - scheduleStartHour * 60) / 60) *
                                rowHeight;
                              const naturalHeight =
                                ((endMinutes - startMinutes) / 60) * rowHeight -
                                2;
                              const height = Math.max(naturalHeight, 48);
                              return (
                                <div
                                  key={idx}
                                  onClick={() =>
                                    handleScheduleItemClick(classItem)
                                  }
                                  onMouseEnter={() =>
                                    setHoveredScheduleItem(
                                      classItem.class_ || null,
                                    )
                                  }
                                  onMouseLeave={() =>
                                    setHoveredScheduleItem(null)
                                  }
                                  className="absolute px-1.5 py-1 text-white pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity overflow-hidden"
                                  style={{
                                    backgroundColor: "#BE0000",
                                    top: `${topOffset}px`,
                                    height: `${height}px`,
                                    left: 0,
                                    right: 0,
                                  }}
                                >
                                  <div
                                    className="font-semibold truncate"
                                    style={{
                                      fontSize: "11px",
                                      lineHeight: "1.4",
                                    }}
                                  >
                                    {classItem.class_}
                                  </div>
                                  <div
                                    className="truncate"
                                    style={{
                                      fontSize: "10px",
                                      lineHeight: "1.4",
                                      opacity: 0.9,
                                    }}
                                  >
                                    {classItem.room}
                                  </div>
                                  <div
                                    className="truncate"
                                    style={{
                                      fontSize: "10px",
                                      lineHeight: "1.4",
                                      opacity: 0.8,
                                    }}
                                  >
                                    {classItem.startTime}-{classItem.endTime}
                                  </div>
                                  {hoveredScheduleItem === classItem.class_ && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleDeleteCourse(e, classItem)
                                      }
                                      className="absolute top-1 right-1 w-4 h-4 bg-white text-red-700 rounded-full flex items-center justify-center hover:bg-red-100 transition-all shadow-sm"
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                      }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!visualizationData && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Visualizations
              </h3>
              <div className="text-center py-12 text-slate-500">
                <p className="text-4xl mb-2">📊</p>
                <p>No visualizations yet</p>
                <p className="text-sm mt-1">
                  Upload a transcript to generate a schedule
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={isAutosaveMode ? undefined : () => void handleSavePlan()}
            disabled={isAutosaveMode && autosaveStatus === "saving"}
            className="w-full py-3 rounded-xl font-semibold text-sm shadow-sm border transition-all duration-300 flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                savedFlash || autosaveStatus === "saved" ? "#BE0000" : "white",
              color:
                savedFlash || autosaveStatus === "saved" ? "white" : "#BE0000",
              borderColor: "#BE0000",
              cursor: isAutosaveMode ? "default" : "pointer",
            }}
          >
            {autosaveStatus === "saving" ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
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
                Saving...
              </>
            ) : autosaveStatus === "saved" || savedFlash ? (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Saved
              </>
            ) : autosaveStatus === "error" ? (
              <>
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
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                Save Failed
              </>
            ) : (
              <>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {isAutosaveMode ? "Autosave On" : "Save Plan"}
              </>
            )}
          </button>

          <div className="mt-4 flex justify-center items-center gap-3">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={isInitialCourseLoad}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BE0000]/50 text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">
                {isInitialCourseLoad ? "Loading departments..." : "All Depts"}
              </option>
              {browserDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={class_code}
              onChange={(e) => setClass_code(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddCourse();
              }}
              disabled={!selectedDepartment}
              placeholder={
                selectedDepartment
                  ? "Enter class code (e.g., 1410)"
                  : "Select a department first"
              }
              className={`px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#BE0000]/50 transition-all ${
                selectedDepartment
                  ? "border-slate-300 text-slate-800 bg-white"
                  : "border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed"
              }`}
            />
            <button
              type="button"
              onClick={() => void handleAddCourse()}
              disabled={!selectedDepartment}
              className={`px-6 py-2 text-white font-semibold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                selectedDepartment
                  ? "hover:opacity-90 hover:shadow-lg"
                  : "opacity-40 cursor-not-allowed"
              }`}
              style={{ backgroundColor: "#BE0000" }}
            >
              <span>+</span>ADD COURSE
            </button>
            <button
              type="button"
              onClick={toggleCoursesPanel}
              className="px-6 py-2 text-white font-semibold rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              style={{ backgroundColor: "#BE0000" }}
            >
              {showCoursesPanel ? "Hide Courses" : "Browse Courses"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section selection modal ── */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-slate-800">
                Select a Section for Class {class_code}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              {availableSections.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  No sections available
                </p>
              ) : (
                availableSections.map((section, index) => {
                  const conflictReasons = getSectionConflict(section);
                  const isDisabled = !!conflictReasons;
                  return (
                    <div
                      key={index}
                      onClick={() =>
                        !isDisabled && void handleSelectSection(section)
                      }
                      className={`border rounded-lg p-4 transition-all ${
                        isDisabled
                          ? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
                          : "border-slate-200 hover:border-red-700 hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4
                              className={`font-semibold ${isDisabled ? "text-slate-400" : "text-slate-800"}`}
                            >
                              {section.class_}
                            </h4>

                            {formatSectionTypeLabel(section.section_type) && (
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                  isDisabled
                                    ? "text-slate-400 border-slate-300 bg-slate-200"
                                    : "text-[#BE0000] border-red-200 bg-red-50"
                                }`}
                              >
                                {formatSectionTypeLabel(section.section_type)}
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}
                          >
                            <span className="font-medium">Day:</span>{" "}
                            {section.day}
                          </p>
                          <p
                            className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}
                          >
                            <span className="font-medium">Time:</span>{" "}
                            {section.startTime} - {section.endTime}
                          </p>
                          <p
                            className={`text-sm ${isDisabled ? "text-slate-400" : "text-slate-600"}`}
                          >
                            <span className="font-medium">Room:</span>{" "}
                            {section.room}
                          </p>
                          {isDisabled && (
                            <div className="mt-2 space-y-0.5">
                              {conflictReasons.map((reason, i) => (
                                <p
                                  key={i}
                                  className="text-xs text-red-400 font-medium"
                                >
                                  ⚠ {reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        {!isDisabled && (
                          <button
                            type="button"
                            className="px-3 py-1 text-white text-sm font-semibold rounded hover:opacity-90"
                            style={{ backgroundColor: "#BE0000" }}
                          >
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Course detail modal ── */}
      {showCourseDetailModal && selectedCourse && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeCourseDetails}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-800">
                  {selectedCourse.department} {selectedCourse.course_code}:{" "}
                  {selectedCourse.course_name}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedCourse.credits} credits
                </p>
                {selectedSectionInstructor && (
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-slate-500">
                      {selectedSectionInstructor}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleViewRmp()}
                      className="px-2 py-0.5 text-xs text-white font-semibold rounded hover:opacity-90"
                      style={{ backgroundColor: "#BE0000" }}
                    >
                      Rate My Professor
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeCourseDetails}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
              {selectedCourse.description &&
              selectedCourse.description.trim().length > 0
                ? selectedCourse.description
                : "No description available for this course."}
            </div>

            {/* Prerequisite chain visualizer */}
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                Course Path
              </p>
              {prereqChain.loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
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
                  Loading prerequisite chain…
                </div>
              ) : (
                <PrereqChainViz
                  prereqs={prereqChain.prereqs}
                  current={{
                    label: `${selectedCourse.department} ${selectedCourse.course_code}`,
                  }}
                  unlocks={prereqChain.unlocks}
                />
              )}
            </div>

            {/* Grade distribution button */}
            <div className="mt-4">
              <button
                type="button"
                onClick={openGradeDistributionModal}
                className="px-3 py-2 text-sm font-semibold rounded-lg border transition-all hover:opacity-90"
                style={{
                  color: "#BE0000",
                  borderColor: "#BE0000",
                  backgroundColor: "white",
                }}
              >
                View Grade Distribution
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeCourseDetails}
                className="px-4 py-2 text-white font-semibold rounded-lg hover:opacity-90"
                style={{ backgroundColor: "#BE0000" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <CourseGradeDistributionModal
        isOpen={showGradeDistributionModal}
        onClose={closeGradeDistributionModal}
        course={selectedCourse}
        stats={courseGradeStats}
        isLoading={isLoadingCourseGradeStats}
        error={courseGradeStatsError}
      />

      {/* ── RMP modal ── */}
      {showRmpModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => {
            setShowRmpModal(false);
            setRmpData(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-semibold text-slate-800">
                Rate My Professor
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowRmpModal(false);
                  setRmpData(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {isLoadingRmp && (
              <p className="text-center text-slate-500 py-8">Loading...</p>
            )}

            {!isLoadingRmp && (!rmpData || rmpData.error) && (
              <p className="text-center text-slate-500 py-8">
                {rmpData?.error ?? "No data found for this professor"}
              </p>
            )}

            {!isLoadingRmp && rmpData && !rmpData.error && (
              <div className="space-y-3">
                <p className="text-xl font-semibold text-slate-800">
                  {rmpData.name}
                </p>
                {rmpData.department && (
                  <p className="text-sm text-slate-500">{rmpData.department}</p>
                )}
                <div className="grid grid-cols-3 gap-3 my-4">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p
                      className="text-3xl font-bold"
                      style={{ color: "#BE0000" }}
                    >
                      {rmpData.rating ?? "N/A"}
                      {rmpData.rating != null && (
                        <span className="text-sm text-slate-400">/5</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Rating</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p
                      className="text-3xl font-bold"
                      style={{ color: "#BE0000" }}
                    >
                      {rmpData.difficulty ?? "N/A"}
                      {rmpData.difficulty != null && (
                        <span className="text-sm text-slate-400">/5</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Difficulty</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p
                      className="text-3xl font-bold"
                      style={{ color: "#BE0000" }}
                    >
                      {rmpData.would_take_again != null
                        ? `${rmpData.would_take_again}%`
                        : "N/A"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Would Take Again
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Based on {rmpData.num_ratings} rating(s)
                </p>
                {rmpData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {rmpData.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 text-sm rounded-full bg-slate-100 text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <a
                  href={rmpData.rmp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center mt-4 px-4 py-2 text-white font-semibold rounded-lg hover:opacity-90 bg-[#BE0000]"
                >
                  View on Rate My Professor
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Panel expand/collapse toggle */}
      <button
        type="button"
        onClick={toggleRightPanel}
        className="absolute w-8 h-8 rounded-full bg-white shadow-md border flex items-center justify-center hover:bg-slate-50 z-10"
        style={{
          left: isRightPanelExpanded ? "10px" : "calc(33.33% - 16px)",
          top: "60%",
          borderColor: "#BE0000",
          transition: "left 0.5s ease-in-out",
        }}
        title={isRightPanelExpanded ? "Show chat" : "Expand panel"}
      >
        {isRightPanelExpanded ? (
          <span className="text-lg font-bold" style={{ color: "#BE0000" }}>
            ×
          </span>
        ) : (
          <span className="text-lg font-bold" style={{ color: "#BE0000" }}>
            ←
          </span>
        )}
      </button>
    </div>
  );
}
