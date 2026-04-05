from pydantic import BaseModel                  #have it in one right now but can seperate it out later if needed
from typing import List

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

class ScheduleItem(BaseModel):
    day: str
    startTime: str
    endTime: str
    class_: str
    room: str
    instructor: str | None = None

class CourseItem(BaseModel):
    department: str
    course_code: str
    course_name: str
    credits: int
    description: str

class RegisterIn(BaseModel):
    username: str
    password: str

class LoginIn(BaseModel):
    username: str
    password: str
    remember_me: bool = False

class UserOut(BaseModel):
    id: int
    username: str
    role: str
    class Config:
        from_attributes = True

DUMMY_SCHEDULE: List[ScheduleItem] = [
    ScheduleItem(
        day="Monday",
        startTime="9:00 AM",
        endTime="10:30 AM",
        class_="CS 3500",
        room="Room 101",
    ),
    ScheduleItem(
        day="Monday",
        startTime="11:00 AM",
        endTime="12:30 PM",
        class_="CS 3810",
        room="Lab 203",
    ),
    ScheduleItem(
        day="Tuesday",
        startTime="10:00 AM",
        endTime="12:30 PM",
        class_="CS 3130",
        room="Lab 105",
    ),
    ScheduleItem(
        day="Tuesday",
        startTime="2:00 PM",
        endTime="3:30 PM",
        class_="CS 3500 Lab",
        room="Room 304",
    ),
    ScheduleItem(
        day="Wednesday",
        startTime="9:00 AM",
        endTime="10:30 AM",
        class_="CS 3500",
        room="Room 101",
    ),
    ScheduleItem(
        day="Thursday",
        startTime="10:00 AM",
        endTime="12:30 PM",
        class_="CS 3130",
        room="Lab 105",
    ),
    ScheduleItem(
        day="Friday",
        startTime="10:00 AM",
        endTime="11:30 AM",
        class_="CS 3090",
        room="Lab 401",
    ),
]
