from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.models import ScheduleItem, CourseItem
from app.database.session import get_session
from app.database.query_routers.class_sections_query import *
from app.database.query_routers.courses_query import *

from datetime import datetime


router = APIRouter(prefix="/schedule", tags=["schedule"])


# ── GET /schedule/get_courses ──────────────────────────────────────────────
# Returns the full course catalog (all courses with dept, code, name, credits, description).
# Used by the frontend to populate the course browser, credit lookups, and search.
# Must be defined before /{class_code} so FastAPI doesn't treat "get_courses" as a path param.
@router.get("/get_courses", response_model=List[CourseItem])
def get_courses(db: Session = Depends(get_session)) -> List[CourseItem]:
    courses = list_courses(db)
    frontend_courses: list[CourseItem] = []
    print(len(courses))

    for course in courses:
        # Resolve department subject via the ORM relationship (Course -> Department)
        dept_obj = getattr(course, "department", None)
        subject = getattr(dept_obj, "subject", None) or "Unknown"

        frontend_courses.append(CourseItem(
            id=course.id,
            department=subject,
            course_code=str(course.number) if course.number is not None else "",
            course_name=str(course.name) if course.name is not None else "",
            credits=course.units if course.units is not None else 0,
            description=str(course.description) if course.description is not None else "",
        ))
    return frontend_courses


# ── GET /schedule/{class_code} ─────────────────────────────────────────────
# Returns all available sections for a given course number (e.g. 1410).
# Optionally filters by department query param (e.g. ?department=CS) when
# multiple departments share the same course number.
# Each section includes day, start/end times, section code, and room.
# Used by the frontend to show the section selection modal when adding a course.
@router.get("/{class_code}", response_model=List[ScheduleItem])
def get_classes_from_code(
    class_code: int,
    department: Optional[str] = Query(default=None),
    db: Session = Depends(get_session)
) -> List[ScheduleItem]:
    list_section = get_class_sections_by_course_number(db, str(class_code))
    frontend_sections: list[ScheduleItem] = []

    for class_section in list_section:
        # Walk the relationship chain: ClassSection -> Course -> Department -> subject
        course_obj = getattr(class_section, "course", None)
        dept_obj = getattr(course_obj, "department", None)
        subject = getattr(dept_obj, "subject", None) or department or "Unknown"

        # Skip sections that don't match the requested department filter
        if department and subject != department:
            continue

        # Convert stored time objects to "H:MM AM/PM" format for the frontend
        time_str = f"{class_section.start_time.strftime('%H:%M')} {class_section.end_time.strftime('%H:%M')}"
        print(f"\nid: {class_section.id}, section: {class_section.section_code}, days: {class_section.days}, time: {time_str}")

        frontend_sections.append(ScheduleItem(
            day=class_section.days,
            startTime=datetime.strptime(time_str.split(" ")[0], "%H:%M").strftime("%-I:%M %p"),
            endTime=datetime.strptime(time_str.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
            class_=f"{subject} {class_code} - {class_section.section_code}",
            room=getattr(class_section, "location", None) or "TBD",
        ))
    return frontend_sections


# ══════════════════════════════════════════════════════════════════════════════
# NOTE: The routes below are DUPLICATES of the two above, but use explicit
# SQLAlchemy joins instead of ORM relationships. Only one pair should be kept.
# ══════════════════════════════════════════════════════════════════════════════


# ── GET /schedule/get_courses (duplicate) ──────────────────────────────────
# Same as above but uses an explicit Course-Department join instead of the
# ORM relationship. Returns identical CourseItem data.
@router.get("/get_courses", response_model=List[CourseItem])
def get_courses(db: Session = Depends(get_session)) -> List[CourseItem]:
    # Explicit join: Course + Department to get subject (e.g. "CS", "MATH")
    results = (
        db.query(Course, Department)
        .join(Department, Course.department_id == Department.id)
        .all()
    )
    frontend_courses: list[CourseItem] = []
    print(len(results))

    for course, department in results:
        frontend_courses.append(CourseItem(
            id=course.id,
            department=department.subject,
            course_code=str(course.number) if course.number is not None else "",
            course_name=str(course.name) if course.name is not None else "",
            credits=course.units if course.units is not None else 0,
            description=str(course.description) if course.description is not None else "",
        ))
    return frontend_courses


# ── GET /schedule/{class_code} (duplicate) ─────────────────────────────────
# Same as above but uses an explicit three-way join (ClassSection -> Course -> Department)
# instead of ORM relationships. Returns identical ScheduleItem data.
@router.get("/{class_code}", response_model=List[ScheduleItem])
def get_classes_from_code(
    class_code: int,
    department: Optional[str] = Query(default=None),
    db: Session = Depends(get_session)
) -> List[ScheduleItem]:
    # Explicit three-way join to resolve department subject for each section
    results = (
        db.query(ClassSection, Course, Department)
        .join(Course, ClassSection.course_id == Course.id)
        .join(Department, Course.department_id == Department.id)
        .filter(Course.number == str(class_code))
        .all()
    )

    # Apply department filter if provided
    if department:
        results = [(s, c, d) for s, c, d in results if d.subject == department]

    frontend_sections: list[ScheduleItem] = []
    for class_section, course, dept in results:
        # Convert stored time objects to "H:MM AM/PM" format for the frontend
        time_str = f"{class_section.start_time.strftime('%H:%M')} {class_section.end_time.strftime('%H:%M')}"
        print(f"\nid: {class_section.id}, section: {class_section.section_code}, days: {class_section.days}, time: {time_str}")

        frontend_sections.append(ScheduleItem(
            day=class_section.days,
            startTime=datetime.strptime(time_str.split(" ")[0], "%H:%M").strftime("%-I:%M %p"),
            endTime=datetime.strptime(time_str.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
            class_=f"{dept.subject} {class_code} - {class_section.section_code}",
            room=class_section.location or "TBD",
        ))
    return frontend_sections