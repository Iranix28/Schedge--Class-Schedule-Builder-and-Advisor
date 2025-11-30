from datetime import time
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


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

#CLASS SECTION db models------------------------------------------

class ClassSectionBase(BaseModel):
    course_id: int
    term_season: str       # Fall
    term_year: int         # 2025
    section_code: str      

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



########## returns models

class CourseRead(BaseModel):
    id: int
    department_id: int
    number: str
    name: str

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
