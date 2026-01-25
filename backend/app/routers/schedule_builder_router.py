from fastapi import APIRouter
from typing import List
from app.models.models import ScheduleItem, CourseItem, DUMMY_SCHEDULE
from app.database.session import SessionLocal
from app.database.query_routers.class_sections_query import *
from app.database.query_routers.courses_query import *

from datetime import datetime



db = SessionLocal()


router = APIRouter(prefix="/schedule", tags=["schedule"])

@router.get("/{class_code}", response_model=List[ScheduleItem]) 
def get_classes_from_code(class_code: int) -> List[ScheduleItem]:
    list_section = get_class_sections_by_course_number(db, str(class_code))
    print(list_section)
    frontend_sections: list[ScheduleItem] = []
    for class_section in list_section:
        time = f"{class_section.start_time.strftime('%H:%M')} {class_section.end_time.strftime('%H:%M')}"
        print(f"\nid: {class_section.id}, section: {class_section.section_code}, days: {class_section.days}, time: {time}")

        # add this class to the frontend sections list
        frontend_sections.append(ScheduleItem(
            day=class_section.days,
            startTime=datetime.strptime(time.split(" ")[0], "%H:%M").strftime("%-I:%M %p"),
            endTime=datetime.strptime(time.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
            class_= str(class_code)  + " " + str(class_section.section_code),
            room="TBD",
        ))
    print(DUMMY_SCHEDULE)
    print("\n")
    print(frontend_sections)
    return frontend_sections

@router.get("/", response_model=List[CourseItem])
def get_courses() -> List[CourseItem]:
    return [
        CourseItem(
            department=course.department_id,
            course_code=course.number,
            course_name=course.name,
            credits=course.units,
            description=course.description,
        )
        for course in db
    ]
