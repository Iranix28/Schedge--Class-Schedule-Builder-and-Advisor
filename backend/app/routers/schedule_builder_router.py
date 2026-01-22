from fastapi import APIRouter
from typing import List
from app.models.models import ScheduleItem, DUMMY_SCHEDULE

router = APIRouter(prefix="/schedule", tags=["schedule"])

@router.get("/{class_code}", response_model=List[ScheduleItem]) 
def get_classes_from_code(class_code: int) -> List[ScheduleItem]:
    return DUMMY_SCHEDULE