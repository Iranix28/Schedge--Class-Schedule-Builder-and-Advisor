from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
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
        frontend_courses.append(CourseItem(
            department="CS",
            course_code=str(course.number) if course.number is not None else "",
            course_name=str(course.name) if course.name is not None else "",
            credits=course.units if course.units is not None else 0,
            description=str(course.description) if course.description is not None else "",
        ))
    return frontend_courses


# THIS COMES SECOND - after specific routes
@router.get("/{class_code}", response_model=List[ScheduleItem])
def get_classes_from_code(class_code: int, db: Session = Depends(get_session)) -> List[ScheduleItem]:
    try:
        list_section = get_class_sections_by_course_number(db, str(class_code))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error fetching sections: {str(e)}")

    frontend_sections: list[ScheduleItem] = []

    for class_section in list_section:
        # Skip sections with missing time data
        if class_section.start_time is None or class_section.end_time is None:
            print(f"Skipping section {class_section.section_code} — missing start/end time")
            continue

        try:
            start_str = class_section.start_time.strftime("%H:%M")
            end_str   = class_section.end_time.strftime("%H:%M")

            start_display = datetime.strptime(start_str, "%H:%M").strftime("%-I:%M %p")
            end_display   = datetime.strptime(end_str,   "%H:%M").strftime("%-I:%M %p")

            print(f"\nid: {class_section.id}, section: {class_section.section_code}, "
                  f"days: {class_section.days}, time: {start_str} {end_str}")

            frontend_sections.append(ScheduleItem(
                day=class_section.days,
                startTime=start_display,
                endTime=end_display,
                class_=str(class_code) + " - " + str(class_section.section_code),
                room=class_section.location if class_section.location else "TBD",
            ))
        except Exception as e:
            print(f"Skipping section {class_section.section_code} — error: {e}")
            continue

    return frontend_sections