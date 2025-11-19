from datetime import datetime, time
from typing import List, Optional

from sqlalchemy import Integer, String, Time, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.database.base import Base

class Department(Base):
    """
    Department table (majors)
    """

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)

    # One department → many courses
    courses: Mapped[List["Course"]] = relationship(
        back_populates="department"
    )

class Course(Base):
    """
    Catalog courses
    """

    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
    )
    number: Mapped[str] = mapped_column(String(16), nullable=False)   # "3500"
    name: Mapped[str] = mapped_column(String(255), nullable=False)    # "Software Practice"

    units: Mapped[Optional[int]] = mapped_column(Integer, nullable=False)  
    description: Mapped[Optional[str]] = mapped_column(String(5000), nullable=True)

    embedding: Mapped[Optional[List[float]]] = mapped_column(           
        Vector(1024),                                                 # change based embedding model
        nullable=True,
    )

    # Relationships
    department: Mapped["Department"] = relationship(
        back_populates="courses"
    )

    class_sections: Mapped[List["ClassSection"]] = relationship(
        back_populates="course"
    )

    prerequisites: Mapped[List["CoursePrerequisite"]] = relationship(
        back_populates="course",
        foreign_keys="CoursePrerequisite.course_id",
    )

    prereq_for: Mapped[List["CoursePrerequisite"]] = relationship(
        back_populates="prerequisite_course",
        foreign_keys="CoursePrerequisite.prerequisite_course_id",
    )

class ClassSection(Base):
    """
    A class within a course
    """

    __tablename__ = "class_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )

    term_season: Mapped[str] = mapped_column(String(16), nullable=False)  # "Fall", "Spring"
    term_year: Mapped[int] = mapped_column(Integer, nullable=False)       # 2025
    section_code: Mapped[str] = mapped_column(String(16), nullable=False) # "001", "002"

    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    days: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # "MWF", "TuTh"
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    professor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    course: Mapped["Course"] = relationship(
        back_populates="class_sections"
    )

class CoursePrerequisite(Base):
    """
    Prereqs
    """

    __tablename__ = "course_prerequisites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    prerequisite_course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )

    course: Mapped["Course"] = relationship(
        back_populates="prerequisites",
        foreign_keys=[course_id],
    )
    prerequisite_course: Mapped["Course"] = relationship(
        back_populates="prereq_for",
        foreign_keys=[prerequisite_course_id],
    )