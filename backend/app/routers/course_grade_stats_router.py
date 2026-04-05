from fastapi import APIRouter, HTTPException

from app.database.session import DBSession
from app.database.query_routers.course_grade_stats_query import (
    get_course_grade_stats_by_department_and_number,
)
from app.models.db_models import CourseGradeStatsRead

router = APIRouter(prefix="/course-grade-stats", tags=["course grade stats"])


@router.get("/{department_subject}/{course_number}", response_model=CourseGradeStatsRead)
def get_course_grade_stats(department_subject: str, course_number: str, db: DBSession):
    stats = get_course_grade_stats_by_department_and_number(
        db=db,
        department_subject=department_subject,
        course_number=course_number,
    )

    if stats is None:
        raise HTTPException(status_code=404, detail="Course grade stats not found")

    return stats