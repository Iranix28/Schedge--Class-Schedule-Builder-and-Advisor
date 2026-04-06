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

        # Skip sections with missing time data
        if class_section.start_time is None or class_section.end_time is None:
            continue

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