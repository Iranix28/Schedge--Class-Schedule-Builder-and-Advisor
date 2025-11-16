from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.schema import CoursePrerequisite
from app.models.db_models import CoursePrerequisiteCreate, CoursePrerequisiteUpdate

def create_course_prerequisite(db: Session, course_prerequisite_in: CoursePrerequisiteCreate) -> CoursePrerequisite:
    cp = CoursePrerequisite(**course_prerequisite_in.model_dump())
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


def list_course_prerequisites(db: Session, course_id: Optional[int] = None) -> List[CoursePrerequisite]:
    stmt = select(CoursePrerequisite)
    if course_id is not None:
        stmt = stmt.where(CoursePrerequisite.course_id == course_id)
    result = db.execute(stmt)
    return result.scalars().all()


def get_course_prerequisite(db: Session, cp_id: int) -> Optional[CoursePrerequisite]:
    stmt = select(CoursePrerequisite).where(CoursePrerequisite.id == cp_id)
    result = db.execute(stmt)
    return result.scalars().first()

# def update_class_section(db: Session, class_section_id: int, class_section_in: ClassSectionUpdate) -> Optional[ClassSection]:
#     class_section = get_class_section(db, class_section_id)
#     if not class_section:
#         return None
    
#     data = class_section_in.model_dump(exclude_unset=True)
#     for field, value in data.itmems():
#         setattr(class_section, field, value)
#         db.add(class_section)
#     db.commit()
#     db.refresh(class_section)
#     return class_section
