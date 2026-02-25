from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.models import ScheduleItem, CourseItem
from app.database.session import get_session
from app.database.query_routers.class_sections_query import *
from app.database.query_routers.courses_query import *

from datetime import datetime


router = APIRouter(prefix="/schedule", tags=["schedule"])


# THIS MUST COME FIRST - before /{class_code}
@router.get("/get_courses", response_model=List[CourseItem])
def get_courses(db: Session = Depends(get_session)) -> List[CourseItem]:
    courses = list_courses(db)
    frontend_courses: list[CourseItem] = []
    print(len(courses))

    for course in courses:
        # course.department is the joined Department ORM object (via relationship)
        # Fall back gracefully if relationship isn't loaded
        dept_obj = getattr(course, "department", None)
        subject = getattr(dept_obj, "subject", None) or "Unknown"

        frontend_courses.append(CourseItem(
            department=subject,
            course_code=str(course.number) if course.number is not None else "",
            course_name=str(course.name) if course.name is not None else "",
            credits=course.units if course.units is not None else 0,
            description=str(course.description) if course.description is not None else "",
        ))
    return frontend_courses


# THIS COMES SECOND - after specific routes
@router.get("/{class_code}", response_model=List[ScheduleItem])
def get_classes_from_code(
    class_code: int,
    department: Optional[str] = Query(default=None),
    db: Session = Depends(get_session)
) -> List[ScheduleItem]:
    list_section = get_class_sections_by_course_number(db, str(class_code))
    frontend_sections: list[ScheduleItem] = []

    for class_section in list_section:
        # Resolve subject via the section -> course -> department relationship chain
        course_obj = getattr(class_section, "course", None)
        dept_obj = getattr(course_obj, "department", None)
        subject = getattr(dept_obj, "subject", None) or department or "Unknown"

        # If a department filter was passed, skip sections that don't match
        if department and subject != department:
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


# THIS MUST COME FIRST - before /{class_code}
@router.get("/get_courses", response_model=List[CourseItem])
def get_courses(db: Session = Depends(get_session)) -> List[CourseItem]:
    # Join Course with Department to get the real subject (e.g. "CS", "MATH")
    results = (
        db.query(Course, Department)
        .join(Department, Course.department_id == Department.id)
        .all()
    )
    frontend_courses: list[CourseItem] = []
    print(len(results))

    for course, department in results:
        frontend_courses.append(CourseItem(
            department=department.subject,
            course_code=str(course.number) if course.number is not None else "",
            course_name=str(course.name) if course.name is not None else "",
            credits=course.units if course.units is not None else 0,
            description=str(course.description) if course.description is not None else "",
        ))
    return frontend_courses


# THIS COMES SECOND - after specific routes
@router.get("/{class_code}", response_model=List[ScheduleItem])
def get_classes_from_code(
    class_code: int,
    department: Optional[str] = Query(default=None),
    db: Session = Depends(get_session)
) -> List[ScheduleItem]:
    # Join ClassSection -> Course -> Department to resolve subject dynamically
    results = (
        db.query(ClassSection, Course, Department)
        .join(Course, ClassSection.course_id == Course.id)
        .join(Department, Course.department_id == Department.id)
        .filter(Course.number == str(class_code))
        .all()
    )

    # If department filter is provided, narrow results
    if department:
        results = [(s, c, d) for s, c, d in results if d.subject == department]

    frontend_sections: list[ScheduleItem] = []
    for class_section, course, dept in results:
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