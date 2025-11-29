from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.schema import ClassSection, Department, Course, ClassSection
from app.models.db_models import ClassSectionCreate, ClassSectionUpdate, ClassSectionCreateByCourseCode
from exceptions import EntityNotFound

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

def create_class_section_by_course_code(
    db: Session,
    data: ClassSectionCreateByCourseCode,
) -> ClassSection:

    stmt_dept = select(Department).where(Department.subject == data.department_subject)
    department = db.execute(stmt_dept).scalar_one_or_none()
    if department is None:
        raise EntityNotFound(
            entity_name="Department",
            entity_id=data.department_subject,
        )

    stmt_course = select(Course).where(
        Course.department_id == department.id,
        Course.number == data.course_number,
    )

    course = db.execute(stmt_course).scalar_one_or_none()
    if course is None:
        raise EntityNotFound(
            entity_name="Course",
            entity_id=f"{data.department_subject} {data.course_number}",
        )

    class_section = ClassSection(
        course_id=course.id,
        term_season=data.term_season,
        term_year=data.term_year,
        section_code=data.section_code,
        location=data.location,
        days=data.days,
        start_time=data.start_time,
        end_time=data.end_time,
        professor_name=data.professor_name,
    )

    db.add(class_section)
    db.commit()
    db.refresh(class_section)

    return class_section

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
