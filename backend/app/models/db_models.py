from datetime import time, datetime
from typing import List, Optional
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

#TODO: need to delete duplicate models course_read and class_section_read ???

#DEPARTMENT db_ models----------------------------------------
class DepartmentBase(BaseModel):
    name: str
    subject: str


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None


#COURSE db modelsss--------------------------------------------

class CourseBase(BaseModel):
    department_id: int
    number: str  # 3500
    name: str    # Software Practice
    units: int  
    description: Optional[str] = None
    prereq_conditions: Optional[list] = None   # list of prereq conditions as strings, e.g. ["CS 2500 or CS 2501", "MATH 1550"]


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    department_id: Optional[int] = None
    number: Optional[str] = None
    name: Optional[str] = None
    units: Optional[int] = None
    description: Optional[str] = None

class CourseRead(BaseModel):
    id: int
    department_id: int
    number: str
    name: str
    units: int
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class CourseGradeStatsRead(BaseModel):
    id: int
    course_id: int

    a_count: int
    b_count: int
    c_count: int
    d_count: int
    e_count: int
    cr_count: int
    nc_count: int
    w_count: int
    other_count: int

    total_students: int
    letter_graded_students: int

    average_gpa: Optional[Decimal] = None

    withdrawal_rate: Decimal
    completion_rate: Decimal

    failure_rate_letter_only: Optional[Decimal] = None
    failure_rate_total: Decimal

    pass_rate_letter_only: Optional[Decimal] = None
    pass_rate_total: Decimal

    a_rate: Optional[Decimal] = None
    b_or_better_rate: Optional[Decimal] = None
    c_or_better_rate: Optional[Decimal] = None

    letter_graded_rate: Decimal
    nonstandard_grading_rate: Decimal
    other_rate: Decimal

    is_low_sample: bool
    has_letter_grades: bool
    has_nonstandard_grading: bool

    grade_distribution: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)

#CLASS SECTION db models------------------------------------------

class ClassSectionBase(BaseModel):
    course_id: int
    term_season: str       # Fall
    term_year: int         # 2025
    section_code: str     
    section_type: Optional[str] = None
 

    location: Optional[str] = None
    days: Optional[str] = None      # MWF, TuTh
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    professor_name: Optional[str] = None


class ClassSectionCreate(ClassSectionBase):
    pass


class ClassSectionUpdate(BaseModel):
    """For partial updates"""
    course_id: Optional[int] = None
    term_season: Optional[str] = None
    term_year: Optional[int] = None
    section_code: Optional[str] = None

    location: Optional[str] = None
    days: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    professor_name: Optional[str] = None

class ClassSectionRead(BaseModel):
    id: int
    course_id: int
    term_season: str
    term_year: int
    section_code: str
    section_type: Optional[str] = None

    location: Optional[str] = None
    days: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    professor_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClassSectionCreateByCourseCode(BaseModel):
    department_subject: str  
    course_number: str       

    term_season: str         
    term_year: int           
    section_code: str        
    section_type: Optional[str] = None

    location: Optional[str] = None
    days: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    professor_name: Optional[str] = None

#COURSE PREREQUISITE db models------------------------------------------

class CoursePrerequisiteBase(BaseModel):
    course_id: int
    prerequisite_course_id: int


class CoursePrerequisiteCreate(CoursePrerequisiteBase):
    pass


class CoursePrerequisiteUpdate(BaseModel):

    course_id: Optional[int] = None
    prerequisite_course_id: Optional[int] = None

class CoursePrerequisiteCreateByCode(BaseModel):
    department_subject: str  
    course_number: str       
    prerequisite_department_subject: str  
    prerequisite_course_number: str

#AUDIT db models------------------------------------------

class AuditRuleRead(BaseModel):
    id: int
    rule_group: str  # "ALLOW" | "BLOCK"
    kind: str        # "COURSE" | "RANGE" | "SUBJECT_LEVEL"

    # If kind == COURSE
    course_code: Optional[str] = None # e.g. "CS 3500"
    course_name: Optional[str] = None 

    # If kind == RANGE/SUBJECT_LEVEL
    subject: Optional[str] = None # e.g. "CS"
    number_min: Optional[int] = None
    number_max: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class AuditSubrequirementRead(BaseModel):
    id: int
    title: str
    sort_order: int

    needs_count: Optional[int] = None
    needs_credits: Optional[int] = None
    min_grade: Optional[str] = None

    # Convenient “same as text file” lists:
    not_from: List[str] = []
    select_from: List[str] = []

    # Full detail:
    rules: List[AuditRuleRead] = []

    model_config = ConfigDict(from_attributes=True)

class AuditRequirementRead(BaseModel):
    id: int
    title: str
    sort_order: int
    subrequirements: List[AuditSubrequirementRead] = []
    needs_count: Optional[int] = None
    needs_credits: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class UserAuditRead(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    raw_text: Optional[str] = None

    requirements: List[AuditRequirementRead] = []

    model_config = ConfigDict(from_attributes=True)


########## returns models

class CourseRead(BaseModel):
    id: int
    department_id: int
    number: str
    name: str
    prereq_conditions: Optional[list]

    model_config = ConfigDict(from_attributes=True)

class ClassSectionRead(BaseModel):
    id: int
    course_id: int
    term_season: str
    term_year: int
    section_code: str

    location: Optional[str] = None
    days: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None

    model_config = ConfigDict(from_attributes=True)

class CoursePrerequisiteRead(BaseModel):
    id: int
    course_id: int
    prerequisite_course_id: int

    model_config = ConfigDict(from_attributes=True)

class CoursePrerequisiteResponse(BaseModel):
    id: int
    name: str
    number: str

    model_config = ConfigDict(from_attributes=True)

class DepartmentRead(BaseModel):
    id: int
    name: str
    subject: str

    courses: List[CourseRead] = []

    model_config = ConfigDict(from_attributes=True)
