from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.models.db_models import CoursePrerequisiteCreate, CoursePrerequisiteRead

from app.database.query_routers.course_prerequisites_query import create_course_prerequisite, list_course_prerequisites, get_course_prerequisite

from backend.exceptions import EntityNotFound

router = APIRouter(prefix="/course-prerequisites", tags=["course-prerequisites"])


@router.post("/", response_model=CoursePrerequisiteRead, status_code=201)
def create_course_prerequisite_endpoint(course_prerequisite_in: CoursePrerequisiteCreate, db: DBSession):
    cp = create_course_prerequisite(db, course_prerequisite_in)
    return cp


@router.get("/", response_model=List[CoursePrerequisiteRead])           ##add statys codess
def list_course_prerequisites_endpoint(db: DBSession, course_id: Optional[int] = Query(default=None)):
    return list_course_prerequisites(db, course_id=course_id)


@router.get("/{course_prerequisite_id}", response_model=CoursePrerequisiteRead)
def get_course_prerequisite_endpoint(course_prerequisite_id: int, db: DBSession):
    cp = get_course_prerequisite(db, course_prerequisite_id)
    if not cp:
        raise EntityNotFound(entity_name="CoursePrerequisite", entity_id=course_prerequisite_id)
    return cp