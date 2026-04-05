from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.schema import CourseGradeStats, Course, Department


def get_course_grade_stats_by_course_id(
    db: Session,
    course_id: int,
) -> Optional[CourseGradeStats]:
    return db.execute(
        select(CourseGradeStats).where(CourseGradeStats.course_id == course_id)
    ).scalar_one_or_none()


def get_course_grade_stats_by_department_and_number(
    db: Session,
    department_subject: str,
    course_number: str,
) -> Optional[CourseGradeStats]:
    return db.execute(
        select(CourseGradeStats)
        .join(Course, CourseGradeStats.course_id == Course.id)
        .join(Department, Course.department_id == Department.id)
        .where(Department.subject == department_subject)
        .where(Course.number == course_number)
    ).scalar_one_or_none()


def upsert_course_grade_stats(
    db: Session,
    course_id: int,
    values: dict,
) -> CourseGradeStats:
    row = get_course_grade_stats_by_course_id(db, course_id)

    if row is None:
        row = CourseGradeStats(course_id=course_id, **values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)

    db.flush()
    return row