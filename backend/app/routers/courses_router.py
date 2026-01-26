from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.models.db_models import CourseCreate, CourseRead, CourseUpdate

from app.database.query_routers.courses_query import create_course, list_courses, get_course, get_course_by_code

from backend.exceptions import EntityNotFound

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("/", response_model=CourseRead, status_code=201)
def create_course_endpoint(course_in: CourseCreate, db: DBSession):
    course = create_course(db, course_in)
    return course


@router.get("/", response_model=List[CourseRead])           ##add statys codess
def list_courses_endpoint(db: DBSession):
    return list_courses(db)

@router.get("/{course_id}", response_model=CourseRead)
def get_course_endpoint(course_id: int, db: DBSession):
    course = get_course(db, course_id)
    if not course:
        raise EntityNotFound(entity_name="Course", entity_id=course_id)
    return course

@router.get("/by-code/", response_model=CourseRead)
def get_course_by_code_endpoint(subject: str, number: str, db: DBSession):
    course = get_course_by_code(db, subject, number)
    if not course:
        raise EntityNotFound(entity_name="Course", entity_id=f"{subject} {number}")
    return course