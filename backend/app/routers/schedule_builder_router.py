from fastapi import APIRouter
from typing import List
from app.models.models import ScheduleItem, DUMMY_SCHEDULE
from app.database.session import SessionLocal
from app.database.query_routers.class_sections_query import *



db = SessionLocal()


router = APIRouter(prefix="/schedule", tags=["schedule"])

@router.get("/{class_code}", response_model=List[ScheduleItem]) 
def get_classes_from_code(class_code: int) -> List[ScheduleItem]:

    list_section = get_class_sections_by_course_number(db, class_code)

    frontent_sections: list[ScheduleItem] = []
    for class_section in list_section:
        time = f"{class_section.start_time.strftime('%H:%M')} {class_section.end_time.strftime('%H:%M')}"
        print(f"\nid: {class_section.id}, section: {class_section.section_code}, days: {class_section.days}, time: {time}")

        # add this class to the frontend sections list
        frontent_sections.append(ScheduleItem(
            day=class_section.days,
            startTime=time.split(" ")[0],
            endTime=time.split(" ")[1],
            class_=class_section.section_code,
            room="TBD",
        ))

    return frontent_sections