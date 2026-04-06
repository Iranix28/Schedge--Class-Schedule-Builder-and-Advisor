#!/usr/bin/env python3
"""
Import a CSV produced by uofu_spring_2026_to_csv.py into the existing DB codepath
used by updated_scraper.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime

from app.database.query_routers.departments_query import *
from app.database.query_routers.courses_query import *
from app.database.query_routers.course_prerequisites_query import *
from app.database.query_routers.class_sections_query import *
from app.database.session import SessionLocal

TERM_SEASON = "Spring"
TERM_YEAR = 2026


def parse_meeting_rows(schedule_str: str):
    if not schedule_str:
        return []
    rows = []
    for part in schedule_str.split(","):
        part = part.strip()
        if not part or "/" not in part:
            continue
        days, times = part.split("/", 1)
        days = days.strip()
        times = times.strip()
        if times.upper() in {"TBA", "ARRANGED"}:
            rows.append({"days": days, "start": None, "end": None})
            continue
        if "-" not in times:
            continue
        start_s, end_s = [t.strip() for t in times.split("-", 1)]
        try:
            start_t = datetime.strptime(start_s, "%I:%M%p").time()
            end_t = datetime.strptime(end_s, "%I:%M%p").time()
        except ValueError:
            continue
        rows.append({"days": days, "start": start_t, "end": end_t})
    return rows


def _course_id_to_subject_number(course_id: str):
    m = re.match(r"^([A-Z]+)(\d{4})$", (course_id or "").strip().upper())
    if not m:
        return None
    return m.group(1), m.group(2)


def _units_to_int(units):
    if units is None:
        return 0
    if isinstance(units, (int, float)):
        return int(units)
    u = str(units).strip()
    if u in {"--", "N/A", ""}:
        return 0
    try:
        return int(float(u))
    except Exception:
        return 0


def read_csv_rows(path: str) -> list[dict]:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            prereqs_raw = row.get("prerequisites") or "[]"
            try:
                row["prerequisites"] = json.loads(prereqs_raw)
            except Exception:
                row["prerequisites"] = []
            rows.append(row)
    return rows


def save_to_db(data: list[dict], dry_run: bool = False):
    db = SessionLocal()
    dept_id_by_subject = {}
    seen_courses = set()
    seen_sections = set()

    created_courses = 0
    created_sections = 0

    def get_or_create_dept(subject: str, department_name: str | None = None) -> int:
        subject = re.sub(r"\s+", "", subject.upper())
        department_name = (department_name or "").strip() or subject
        if subject in dept_id_by_subject:
            return dept_id_by_subject[subject]
        existing = db.query(Department).filter(Department.subject == subject).first()
        if existing:
            # Keep the subject stable, but upgrade the department name if the CSV has a fuller name.
            if not dry_run and department_name and existing.name != department_name:
                existing.name = department_name
                db.commit()
                db.refresh(existing)
            dept_id_by_subject[subject] = existing.id
            return existing.id
        if dry_run:
            dept_id_by_subject[subject] = -1
            return -1
        dept = create_department(db, DepartmentCreate(name=department_name, subject=subject))
        dept_id_by_subject[subject] = dept.id
        return dept.id

    for c in data:
        course_id = (c.get("course_id") or "").strip().upper()
        section_code = (c.get("section") or "").strip()
        section_type = (c.get("component") or "").strip()
        title = (c.get("course_name") or "").strip()
        units_int = _units_to_int(c.get("units"))
        description = (c.get("description") or "").strip() or None
        instructor = (c.get("instructor") or "").strip() or None
        schedule_str = (c.get("schedule") or "").strip()
        location = (c.get("location") or "").strip() or None
        prereqs = c.get("prerequisites") or []
        department_name = (c.get("department_name") or "").strip() or None

        parsed = _course_id_to_subject_number(course_id)
        if not parsed:
            continue
        subject, number = parsed

        dept_id = get_or_create_dept(subject, department_name)

        course_key = (subject, number)
        if course_key not in seen_courses:
            if not dry_run:
                create_course(
                    db,
                    CourseCreate(
                        department_id=dept_id,
                        number=number,
                        name=title or f"{subject}{number}",
                        units=units_int,
                        description=description,
                        prereq_conditions=prereqs,
                    ),
                )
            seen_courses.add(course_key)
            created_courses += 1

        sec_key = (subject, number, TERM_YEAR, section_code)
        if sec_key in seen_sections:
            continue

        meetings = parse_meeting_rows(schedule_str)
        if meetings:
            m0 = meetings[0]
            new_section = ClassSectionCreateByCourseCode(
                department_subject=subject,
                course_number=number,
                term_season=TERM_SEASON,
                term_year=TERM_YEAR,
                section_code=section_code,
                section_type=section_type,
                location=location,
                days=m0["days"],
                start_time=m0["start"],
                end_time=m0["end"],
                professor_name=instructor,
            )
        else:
            new_section = ClassSectionCreateByCourseCode(
                department_subject=subject,
                course_number=number,
                term_season=TERM_SEASON,
                term_year=TERM_YEAR,
                section_code=section_code,
                section_type=section_type,
                location=location,
                days=None,
                start_time=None,
                end_time=None,
                professor_name=instructor,
            )

        if not dry_run:
            create_class_section_by_course_code(db, new_section)
        seen_sections.add(sec_key)
        created_sections += 1

    db.close()
    return created_courses, created_sections


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    rows = read_csv_rows(args.csv_path)
    created_courses, created_sections = save_to_db(rows, dry_run=args.dry_run)
    mode = "DRY RUN" if args.dry_run else "IMPORTED"
    print(f"{mode}: {len(rows)} CSV rows, {created_courses} distinct courses, {created_sections} sections")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
