from typing import List

from fastapi import APIRouter, HTTPException

from app.database.session import DBSession
from app.models.db_models import CourseCreate, CourseRead

from app.database.query_routers.courses_query import create_course, list_courses,get_course, get_course_by_code, list_courses_in_number_range,


from backend.exceptions import EntityNotFound

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("/", response_model=CourseRead, status_code=201)
def create_course_endpoint(course_in: CourseCreate, db: DBSession):
    course = create_course(db, course_in)
    return course

@router.get("/", response_model=List[CourseRead])
def list_courses_endpoint(db: DBSession):
    return list_courses(db)

@router.get("/by-code", response_model=CourseRead)
def get_course_by_code_endpoint(subject: str, number: str, db: DBSession):
    course = get_course_by_code(db, subject=subject, number=number)
    if not course:
        raise EntityNotFound(entity_name="Course", entity_id=f"{subject} {number}")
    return course

@router.get("/range/{subject}/{number_min}/{number_max}", response_model=List[CourseRead])
def list_courses_in_range_endpoint(subject: str, number_min: int, number_max: int, db: DBSession):
    courses = list_courses_in_number_range(db, subject=subject, number_min=number_min, number_max=number_max)
    if not courses:
        raise HTTPException(status_code=404, detail="No courses found in this range")
    return courses

@router.get("/{course_id}", response_model=CourseRead)
def get_course_endpoint(course_id: int, db: DBSession):
    course = get_course(db, course_id)
    if not course:
        raise EntityNotFound(entity_name="Course", entity_id=course_id)
    return course
