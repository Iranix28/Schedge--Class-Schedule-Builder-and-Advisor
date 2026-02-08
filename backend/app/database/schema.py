from datetime import datetime, timezone, time
from typing import List, Optional

from sqlalchemy import Integer, String, Time, ForeignKey, UniqueConstraint, Index, DateTime, Text
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
    days: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # "MoWe", "TuTh"
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

    #============================================== DEGREE AUDIT TABLES ===============================================#

#What if course does not exist in given catalog year. add catalog?
#Want to change course to number, easier for filtering and matching
#change min and max to foregin keys
#very slow parsing for range rules if course nums are not changed to integers
#Given count, but nore select fomr, subrequirement is vague??? case
#ONE BIG CLASS CATALOG????q

class UserAudit(Base):
    __tablename__ = "user_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # or raw_json

    requirements: Mapped[List["AuditRequirement"]] = relationship(
        back_populates="audit",
        cascade="all, delete-orphan",
        )

class AuditRequirement(Base):
    """
    Stores BOTH 'Requirement:' and 'Subrequirement:' lines.
    Use parent_id to represent subrequirements.
    """
    __tablename__ = "audit_requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    audit_id: Mapped[int] = mapped_column(
        ForeignKey("user_audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("audit_requirements.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    node_type: Mapped[str] = mapped_column(String(32), nullable=False)  # "REQUIREMENT" | "SUBREQUIREMENT"
    title: Mapped[str] = mapped_column(String(1024), nullable=False)

    # Common audit fields
    needs_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    needs_credits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    audit: Mapped["UserAudit"] = relationship(back_populates="requirements")

    parent: Mapped[Optional["AuditRequirement"]] = relationship(
        remote_side="AuditRequirement.id",
        back_populates="children",
    )
    children: Mapped[List["AuditRequirement"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )

    rules: Mapped[List["AuditRequirementRule"]] = relationship(
        back_populates="requirement",
        cascade="all, delete-orphan",
    )

class AuditRequirementRule(Base):
    """
    Stores Select From / Not From as rules.
    Supports single course, ranges (CS 3500 TO CS 3505), etc.
    """
    __tablename__ = "audit_requirement_rules"
    __table_args__ = (
 
        UniqueConstraint(
            "requirement_id", "rule_group", "kind", "course_id",
            name="uq_req_rule_course"
        ),

        Index("ix_req_rule_req_group_kind", "requirement_id", "rule_group", "kind"),
        Index("ix_req_rule_dept_minmax", "department_id", "number_min", "number_max"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("audit_requirements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    rule_group: Mapped[str] = mapped_column(String(16), nullable=False)  # "ALLOW" | "BLOCK"
    kind: Mapped[str] = mapped_column(String(32), nullable=False)        # "COURSE" | "RANGE" | "SUBJECT_LEVEL"

    # for COURSE
    course_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # for RANGE/SUBJECT_LEVEL
    department_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    number_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # "3500"
    number_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # "3505"

    requirement: Mapped["AuditRequirement"] = relationship(back_populates="rules")
    course: Mapped[Optional["Course"]] = relationship()        
    department: Mapped[Optional["Department"]] = relationship() 

class UserCompletedCourse(Base):
    __tablename__ = "user_completed_courses"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_user_completed_course"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course: Mapped["Course"] = relationship()