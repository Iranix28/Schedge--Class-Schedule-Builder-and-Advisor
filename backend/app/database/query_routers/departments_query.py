from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.schema import Department
from app.models.db_models import DepartmentCreate

def create_department(db: Session, dept_in: DepartmentCreate) -> Department:
    dept = Department(**dept_in.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def list_departments(db: Session) -> List[Department]:
    stmt = select(Department).order_by(Department.id)
    result = db.execute(stmt)
    return result.scalars().all()


def get_department(db: Session, dept_id: int) -> Optional[Department]:
    stmt = select(Department).where(Department.id == dept_id)
    result = db.execute(stmt)
    return result.scalars().first()
