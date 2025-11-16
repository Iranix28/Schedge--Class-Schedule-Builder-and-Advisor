from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.schema import ClassSection
from app.models.db_models import ClassSectionCreate, ClassSectionUpdate

def create_class_section(db: Session, class_section_in: ClassSectionCreate) -> ClassSection:
    class_section = ClassSection(**class_section_in.model_dump())
    db.add(class_section)
    db.commit()
    db.refresh(class_section)
    return class_section


def list_class_sections(db: Session) -> List[ClassSection]:
    stmt = select(ClassSection).order_by(ClassSection.id)
    result = db.execute(stmt)
    return result.scalars().all()


def get_class_section(db: Session, class_section_id: int) -> Optional[ClassSection]:
    stmt = select(ClassSection).where(ClassSection.id == class_section_id)
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
