from fastapi import APIRouter, Depends
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
    list_section = get_class_sections_by_course_number(db, str(class_code))
    frontend_sections: list[ScheduleItem] = []
    for class_section in list_section:
        time = f"{class_section.start_time.strftime('%H:%M')} {class_section.end_time.strftime('%H:%M')}"
        print(f"\nid: {class_section.id}, section: {class_section.section_code}, days: {class_section.days}, time: {time}")

        frontend_sections.append(ScheduleItem(
            day=class_section.days,
            startTime=datetime.strptime(time.split(" ")[0], "%H:%M").strftime("%-I:%M %p"),
            endTime=datetime.strptime(time.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
            class_=str(class_code) + " - " + str(class_section.section_code),
            room="TBD",
        ))
    return frontend_sections