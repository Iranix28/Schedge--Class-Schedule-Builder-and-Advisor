"use client";

import { useEffect, useState } from "react";
import type { Course, CourseGradeStats } from "../types/chat.types";

type CourseGradeDistributionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  stats: CourseGradeStats | null;
  isLoading: boolean;
  error: string | null;
};

function StatCard({
  label,
  value,
  subtext,
  delay = 0,
}: {
  label: string;
  value: string;
  subtext?: string;
  delay?: number;
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        animation: `fadeSlideUp 0.45s ease-out ${delay}ms both`,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
}

function GradeBar({
  label,
  count,
  percent,
  delay = 0,
  highlight = false,
}: {
  label: string;
  count: number;
  percent: number;
  delay?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="space-y-1"
      style={{ animation: `fadeSlideUp 0.45s ease-out ${delay}ms both` }}
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              highlight
                ? "text-white"
                : "border border-slate-200 bg-slate-100 text-slate-700"
            }`}
            style={highlight ? { backgroundColor: "#BE0000" } : {}}
          >
            {label}
          </span>
          <span className="font-medium text-slate-700">{count}</span>
        </div>
        <span className="text-xs font-semibold text-slate-500">
          {(percent * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(percent * 100, 0)}%`,
            backgroundColor: highlight ? "#BE0000" : "#64748b",
            animation: `growBar 0.8s ease-out ${delay}ms both`,
            transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}

export default function CourseGradeDistributionModal({
  isOpen,
  onClose,
  course,
  stats,
  isLoading,
  error,
}: CourseGradeDistributionModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMounted(false);
      return;
    }

    const timer = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen || !course) return null;

  const total = stats?.total_students || 1;

  const gradeBars = stats
    ? [
        {
          label: "A",
          count: stats.a_count,
          percent: stats.a_count / total,
          highlight: true,
        },
        { label: "B", count: stats.b_count, percent: stats.b_count / total },
        { label: "C", count: stats.c_count, percent: stats.c_count / total },
        { label: "D", count: stats.d_count, percent: stats.d_count / total },
        { label: "E", count: stats.e_count, percent: stats.e_count / total },
        { label: "CR", count: stats.cr_count, percent: stats.cr_count / total },
        { label: "NC", count: stats.nc_count, percent: stats.nc_count / total },
        { label: "W", count: stats.w_count, percent: stats.w_count / total },
        {
          label: "O",
          count: stats.other_count,
          percent: stats.other_count / total,
        },
      ]
    : [];

  const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  };

  const formatPercent = (value: number | string | null | undefined) => {
    const n = toNumber(value);
    if (n === null) return "—";
    return `${(n * 100).toFixed(1)}%`;
  };

  const formatGpa = (value: number | string | null | undefined) => {
    const n = toNumber(value);
    if (n === null) return "—";
    return n.toFixed(2);
  };

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes growBar {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
      `}</style>

      <div
        className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 transition-opacity duration-300 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-5xl rounded-3xl bg-slate-50 shadow-2xl transition-all duration-300 ${
            mounted ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="sticky top-0 z-10 rounded-t-3xl border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Historical Grade Summary
                </p>
                <h3 className="mt-1 text-2xl font-bold text-slate-800">
                  {course.department} {course.course_code}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {course.course_name}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <div
                  className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2"
                  style={{ borderColor: "#BE0000" }}
                />
                <p className="text-sm text-slate-600">
                  Loading grade distribution...
                </p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            ) : !stats ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
                No grade distribution data was found for this course.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 items-stretch xl:grid-cols-[1.5fr_0.9fr]">
                  <div
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    style={{
                      animation: "fadeSlideUp 0.45s ease-out 120ms both",
                    }}
                  >
                    <div className="mb-4">
                      <h4 className="text-lg font-semibold text-slate-800">
                        Grade Distribution
                      </h4>
                      <p className="text-sm text-slate-500">
                        Distribution of final outcomes across students in this
                        course.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {gradeBars.map((item, index) => (
                        <GradeBar
                          key={item.label}
                          label={item.label}
                          count={item.count}
                          percent={item.percent}
                          highlight={item.highlight}
                          delay={index * 50}
                        />
                      ))}
                    </div>
                  </div>

                  <div
                    className="flex h-full flex-col justify-between"
                    style={{
                      animation: "fadeSlideUp 0.45s ease-out 180ms both",
                    }}
                  >
                    <div className="grid grid-cols-1 gap-4 content-start">
                      <StatCard
                        label="C or Better"
                        value={formatPercent(stats.c_or_better_rate)}
                        subtext="Percent of students who earned a C or higher"
                        delay={0}
                      />
                      <StatCard
                        label="Withdrawal Rate"
                        value={formatPercent(stats.withdrawal_rate)}
                        subtext="Percent of students who withdrew"
                        delay={70}
                      />
                      <StatCard
                        label="Average GPA"
                        value={formatGpa(stats.average_gpa)}
                        subtext="Average among letter-graded students"
                        delay={140}
                      />
                      <StatCard
                        label="Total Students"
                        value={String(stats.total_students)}
                        subtext="How many students are in this data sample"
                        delay={210}
                      />
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                        style={{ backgroundColor: "#BE0000" }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
