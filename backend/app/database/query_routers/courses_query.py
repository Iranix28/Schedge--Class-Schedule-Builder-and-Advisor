from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.schema import Course
from app.models.db_models import CourseCreate, CourseUpdate

def create_course(db: Session, course_in: CourseCreate) -> Course:
    course = Course(**course_in.model_dump())
    try:
        db.add(course)
        db.commit()
        db.refresh(course)
        return course

    except IntegrityError:
        db.rollback()
        return None


def list_courses(db: Session) -> List[Course]:
    stmt = select(Course).order_by(Course.id)
    result = db.execute(stmt)
    return result.scalars().all()


def get_course(db: Session, course_id: int) -> Optional[Course]:
    stmt = select(Course).where(Course.id == course_id)
    result = db.execute(stmt)
    return result.scalars().first()

# def update_course(db: Session, course_id: int, course_in: CourseUpdate) -> Optional[Course]:
#     course = get_course(db, course_id)
#     if not course:
#         return None
    
#     data = course_in.model_dump(exclude_unset=True)
#     for field, value in data.itmems():
#         setattr(course, field, value)
#         db.add(course)
#     db.commit()
#     db.refresh(course)
#     return course
