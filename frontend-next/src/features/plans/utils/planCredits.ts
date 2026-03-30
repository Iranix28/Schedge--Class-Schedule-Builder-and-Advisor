import type {
  CourseCatalogItem,
  ScheduleItem,
} from "../types/plan.types";

export function buildCreditsLookup(
  courses: CourseCatalogItem[]
): Record<string, number> {
  const lookup: Record<string, number> = {};

  courses.forEach((course) => {
    const credits =
      typeof course.credits === "number"
        ? course.credits
        : parseFloat(String(course.credits ?? "")) || 0;

    if (course.department && course.course_code) {
      lookup[
        `${course.department.toUpperCase()} ${String(course.course_code)}`
      ] = credits;
    }
  });

  return lookup;
}

export function parseDeptCode(className: string | undefined | null) {
  if (!className || typeof className !== "string") {
    return null;
  }

  const match = className.match(/^([A-Z]+)\s+(\d+)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export function computeCreditsFromSchedule(
  schedule: ScheduleItem[] | undefined,
  lookup: Record<string, number>
): number {
  const seen = new Set<string>();
  let total = 0;

  (schedule || []).forEach((item) => {
    const key = parseDeptCode(item.class_ || "");

    if (key && !seen.has(key)) {
      seen.add(key);
      total += lookup[key] || 0;
    }
  });

  return total;
}