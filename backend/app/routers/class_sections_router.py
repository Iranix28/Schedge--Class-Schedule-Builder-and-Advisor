from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.models.db_models import ClassSectionCreate, ClassSectionRead, ClassSectionUpdate, ClassSectionCreateByCourseCode

from app.database.query_routers.class_sections_query import create_class_section, list_class_sections, get_class_section, create_class_section_by_course_code

from backend.exceptions import EntityNotFound

router = APIRouter(prefix="/classsections", tags=["classsections"])


@router.post("/", response_model=ClassSectionRead, status_code=201)
def create_class_section_endpoint(class_section_in: ClassSectionCreate, db: DBSession):
    cs = create_class_section(db, class_section_in)
    return cs

@router.post("/by_course_code", response_model=ClassSectionRead, status_code=201)
def create_class_section_by_course_code_endpoint(data: ClassSectionCreateByCourseCode, db: DBSession):
    cs = create_class_section_by_course_code(db, data)
    return cs


@router.get("/", response_model=List[ClassSectionRead])           ##add statys codess
def list_class_sections_endpoint(db: DBSession):
    return list_class_sections(db)


@router.get("/{class_id}", response_model=ClassSectionRead)
def get_class_section_endpoint(class_section_id: int, db: DBSession):
    cs = get_class_section(db, class_section_id)
    if not cs:
        raise EntityNotFound(entity_name="ClassSection", entity_id=class_section_id)
    return cs

