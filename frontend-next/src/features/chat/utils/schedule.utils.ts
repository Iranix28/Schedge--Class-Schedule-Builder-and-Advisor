import type { Section, VisualizationItem } from "../types/chat.types";

export const IDEAL_ROW_HEIGHT = 55;
export const MAX_SCHEDULE_HEIGHT = 500;

export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;

  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function getScheduleTimeRange(data?: VisualizationItem[]) {
  if (!data || data.length === 0) {
    return { startHour: 8, endHour: 18 };
  }

  let minMinutes = Infinity;
  let maxMinutes = -Infinity;

  data.forEach((item) => {
    if (item.startTime) {
      minMinutes = Math.min(minMinutes, parseTimeToMinutes(item.startTime));
    }
    if (item.endTime) {
      maxMinutes = Math.max(maxMinutes, parseTimeToMinutes(item.endTime));
    }
  });

  if (minMinutes === Infinity) {
    return { startHour: 8, endHour: 18 };
  }

  return {
    startHour: Math.max(0, Math.floor(minMinutes / 60) - 1),
    endHour: Math.ceil(maxMinutes / 60) + 1,
  };
}

export function parseDayAbbreviations(dayStr: string): string[] {
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

  for (let index = 0; index < dayStr.length; index += 2) {
    const abbreviation = dayStr.substring(index, index + 2);
    if (dayMap[abbreviation]) {
      days.push(dayMap[abbreviation]);
    }
  }

  return days;
}

export function getSectionConflict(
  section: Section,
  scheduleData: VisualizationItem[] = []
): string[] | null {
  const reasons: string[] = [];

  const sectionMatch = section.class_?.match(/^([A-Z]+)\s+(\d+)/);

  if (sectionMatch) {
    const sectionDepartment = sectionMatch[1];
    const courseCode = sectionMatch[2];

    const duplicate = scheduleData.find((item) => {
      const existingMatch = item.class_?.match(/^([A-Z]+)\s+(\d+)/);

      return (
        existingMatch &&
        existingMatch[1] === sectionDepartment &&
        existingMatch[2] === courseCode
      );
    });

    if (duplicate) {
      reasons.push(`Already on schedule (${duplicate.class_})`);
    }
  }

  const days = parseDayAbbreviations(section.day);
  const conflictsByClass: Record<string, string[]> = {};

  for (const day of days) {
    const conflictingItems = scheduleData.filter((existing) => {
      if (existing.day !== day) return false;

      const existingStart = parseTimeToMinutes(existing.startTime);
      const existingEnd = parseTimeToMinutes(existing.endTime);
      const newStart = parseTimeToMinutes(section.startTime);
      const newEnd = parseTimeToMinutes(section.endTime);

      return newStart < existingEnd && newEnd > existingStart;
    });

    for (const conflict of conflictingItems) {
      const className = conflict.class_ || "Unknown class";

      if (!conflictsByClass[className]) {
        conflictsByClass[className] = [];
      }

      conflictsByClass[className].push(day);
    }
  }

  for (const [className, classDays] of Object.entries(conflictsByClass)) {
    reasons.push(`Conflicts with ${className} on ${classDays.join(", ")}`);
  }

  return reasons.length > 0 ? reasons : null;
}