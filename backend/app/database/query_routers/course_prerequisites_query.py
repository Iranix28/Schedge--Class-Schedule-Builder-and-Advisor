from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.orm import Session

from app.database.schema import CoursePrerequisite, Course, Department
from app.models.db_models import CoursePrerequisiteCreate, CoursePrerequisiteUpdate, CoursePrerequisiteCreateByCode
from exceptions import EntityNotFound

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

def _get_course_by_subject_and_number(db: Session, subject: str, number: str) -> Course:
    """helper"""
    dept_stmt = select(Department).where(Department.subject == subject)
    department = db.execute(dept_stmt).scalar_one_or_none()
    if department is None:
        raise EntityNotFound(entity_name="Department", entity_id=subject)

    course_stmt = select(Course).where(
        Course.department_id == department.id,
        Course.number == number,
    )
    course = db.execute(course_stmt).scalar_one_or_none()
    if course is None:
        raise EntityNotFound(
            entity_name="Course",
            entity_id=f"{subject} {number}",
        )

    return course

def get_course_prerequisite_by_subject(db: Session, department_subject: str, course_number: str) -> Optional[CoursePrerequisite]:
    stmt = (
        select(Course)
        .join(Department)
        .where(Department.subject == department_subject)
        .where(Course.number == course_number)
        .options(joinedload(Course.prerequisites))
    )
    course = db.execute(stmt).scalars().first()
    if course:
        prerequisites = [prereq.prerequisite_course for prereq in course.prerequisites]
        return prerequisites
    return None

def create_course_prerequisite_by_codes(db: Session, data: CoursePrerequisiteCreateByCode) -> CoursePrerequisite:
    course = _get_course_by_subject_and_number(db, data.department_subject, data.course_number)
    prereq_course = _get_course_by_subject_and_number(db, data.prerequisite_department_subject, number=data.prerequisite_course_number)
    cp = CoursePrerequisite(
        course_id=course.id,
        prerequisite_course_id=prereq_course.id,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)

    return cp


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
