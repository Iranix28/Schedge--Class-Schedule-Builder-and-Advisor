#!/usr/bin/env python3
"""
Import a CSV produced by the Utah scraper into the existing DB.

This version is defensive against duplicate course rows already present in the DB.
Instead of relying on create_class_section_by_course_code() (which expects exactly
one matching course), it resolves a canonical course row first and then inserts the
section against that course directly.
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
    m = re.match(r"^([A-Z]+)(\d{3,4}[A-Z]?)$", (course_id or "").strip().upper())
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


def _canonical_course(courses: list):
    return sorted(courses, key=lambda c: getattr(c, "id", 10**18))[0]


def save_to_db(data: list[dict], dry_run: bool = False, verbose: bool = False):
    db = SessionLocal()
    dept_id_by_subject = {}
    course_by_key = {}
    seen_sections = set()

    created_courses = 0
    created_sections = 0
    duplicate_course_hits = 0

    ClassSectionModel = globals().get("ClassSection")

    def get_or_create_dept(subject: str, department_name: str | None = None) -> int:
        subject = re.sub(r"\s+", "", subject.upper())
        if subject in dept_id_by_subject:
            return dept_id_by_subject[subject]

        existing = db.query(Department).filter(Department.subject == subject).first()
        if existing:
            if department_name and getattr(existing, "name", None) != department_name and not dry_run:
                existing.name = department_name
                db.commit()
            dept_id_by_subject[subject] = existing.id
            return existing.id

        if dry_run:
            dept_id_by_subject[subject] = -1
            return -1

        dept = create_department(
            db,
            DepartmentCreate(name=department_name or subject, subject=subject),
        )
        dept_id_by_subject[subject] = dept.id
        return dept.id

    def get_or_create_course(dept_id: int, subject: str, number: str, title: str, units_int: int, description, prereqs):
        nonlocal created_courses, duplicate_course_hits

        key = (dept_id, number)
        if key in course_by_key:
            return course_by_key[key]

        matches = (
            db.query(Course)
            .filter(Course.department_id == dept_id, Course.number == number)
            .order_by(Course.id.asc())
            .all()
        )

        if matches:
            course = _canonical_course(matches)
            course_by_key[key] = course
            if len(matches) > 1:
                duplicate_course_hits += 1
                if verbose:
                    ids = [getattr(x, "id", None) for x in matches]
                    print(f"WARNING duplicate course rows for {subject} {number}: ids={ids}; using id={course.id}")
            return course

        if dry_run:
            class DummyCourse:
                id = -1
            course_by_key[key] = DummyCourse()
            created_courses += 1
            return course_by_key[key]

        course = create_course(
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
        course_by_key[key] = course
        created_courses += 1
        return course

    def section_exists_for_course(course_id: int, term_season: str, term_year: int, section_code: str) -> bool:
        if dry_run:
            return False
        if not ClassSectionModel:
            return False
        q = db.query(ClassSectionModel).filter(
            ClassSectionModel.course_id == course_id,
            ClassSectionModel.term_season == term_season,
            ClassSectionModel.term_year == term_year,
            ClassSectionModel.section_code == section_code,
        )
        return q.first() is not None

    def insert_section_for_course(course, term_season: str, term_year: int, section_code: str, section_type: str,
                                  location: str | None, days, start_time, end_time, professor_name: str | None):
        nonlocal created_sections

        if dry_run:
            created_sections += 1
            return

        if ClassSectionModel is None:
            raise RuntimeError(
                "Could not access ClassSection ORM model from imports. "
                "Please expose/import ClassSection so the importer can insert sections directly."
            )

        section = ClassSectionModel(
            course_id=course.id,
            term_season=term_season,
            term_year=term_year,
            section_code=section_code,
            section_type=section_type,
            location=location,
            days=days,
            start_time=start_time,
            end_time=end_time,
            professor_name=professor_name,
        )
        db.add(section)
        db.commit()
        created_sections += 1

    try:
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

            term_season = (c.get("term_season") or "Spring").strip() or "Spring"
            try:
                term_year = int(str(c.get("term_year") or "2026").strip())
            except Exception:
                term_year = 2026

            parsed = _course_id_to_subject_number(course_id)
            if not parsed:
                if verbose:
                    print(f"Skipping row with unparseable course_id: {course_id!r}")
                continue
            subject, number = parsed

            dept_id = get_or_create_dept(subject, department_name=department_name)
            course = get_or_create_course(
                dept_id=dept_id,
                subject=subject,
                number=number,
                title=title,
                units_int=units_int,
                description=description,
                prereqs=prereqs,
            )

            sec_key = (course.id, term_season, term_year, section_code)
            if sec_key in seen_sections:
                continue
            if section_exists_for_course(course.id, term_season, term_year, section_code):
                seen_sections.add(sec_key)
                continue

            meetings = parse_meeting_rows(schedule_str)
            if meetings:
                m0 = meetings[0]
                insert_section_for_course(
                    course,
                    term_season=term_season,
                    term_year=term_year,
                    section_code=section_code,
                    section_type=section_type,
                    location=location,
                    days=m0["days"],
                    start_time=m0["start"],
                    end_time=m0["end"],
                    professor_name=instructor,
                )
            else:
                insert_section_for_course(
                    course,
                    term_season=term_season,
                    term_year=term_year,
                    section_code=section_code,
                    section_type=section_type,
                    location=location,
                    days=None,
                    start_time=None,
                    end_time=None,
                    professor_name=instructor,
                )
            seen_sections.add(sec_key)
    finally:
        db.close()

    return created_courses, created_sections, duplicate_course_hits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    rows = read_csv_rows(args.csv_path)
    created_courses, created_sections, duplicate_course_hits = save_to_db(
        rows,
        dry_run=args.dry_run,
        verbose=args.verbose,
    )
    mode = "DRY RUN" if args.dry_run else "IMPORTED"
    print(
        f"{mode}: {len(rows)} CSV rows, {created_courses} new courses, {created_sections} new sections"
        f"; duplicate existing course groups encountered={duplicate_course_hits}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
