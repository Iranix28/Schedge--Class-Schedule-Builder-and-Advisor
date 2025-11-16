from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.models.db_models import DepartmentCreate, DepartmentRead, DepartmentUpdate

from app.database.query_routers.departments_query import create_department, list_departments, get_department

from backend.exceptions import EntityNotFound

router = APIRouter(prefix="/departments", tags=["departments"])


@router.post("/", response_model=DepartmentRead, status_code=201)
def create_department_endpoint(dept_in: DepartmentCreate, db: DBSession):
    dept = create_department(db, dept_in)
    return dept


@router.get("/", response_model=List[DepartmentRead])           ##add statys codess
def list_departments_endpoint(db: DBSession):
    return list_departments(db)


@router.get("/{dept_id}", response_model=DepartmentRead)
def get_department_endpoint(dept_id: int, db: DBSession):
    dept = get_department(db, dept_id)
    if not dept:
        raise EntityNotFound(entity_name="Department", entity_id=dept_id)
    return dept
