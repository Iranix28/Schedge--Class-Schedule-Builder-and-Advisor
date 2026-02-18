from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.database.session import SessionLocal
from sqlalchemy import func
from pydantic import BaseModel

from app.database.schema import (
    User,
    Plan,
    PlanSemester,
    PlanCourseSelection,
    ChatConversation,
    ChatMessage,
    Course,
    ClassSection,
)

router = APIRouter(prefix="/plans", tags=["plans"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------
# Request Schemas
# ----------------------------

class SemesterInput(BaseModel):
    term_season: str
    term_year: int


class CourseSelectionInput(BaseModel):
    course_id: int
    class_section_id: Optional[int] = None


class ChatMessageInput(BaseModel):
    role: str
    content: str


class ScheduleItemInput(BaseModel):
    class_: str
    day: str
    startTime: str
    endTime: str
    room: str
    course_id: Optional[int] = None
    class_section_id: Optional[int] = None


class PlanCreateRequest(BaseModel):
    user_id: int
    name: str
    semester: SemesterInput
    courseSelections: List[CourseSelectionInput] = []
    messages: List[ChatMessageInput] = []
    schedule: List[ScheduleItemInput] = []


class PlanSummaryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

class ScheduleItemResponse(BaseModel):
    class_: str
    day: str
    startTime: str
    endTime: str
    room: str
    course_id: Optional[int] = None
    class_section_id: Optional[int] = None

# ----------------------------
# SAVE PLAN
# ----------------------------

@router.post("", response_model=PlanSummaryResponse)
def save_plan(payload: PlanCreateRequest, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.id == payload.user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_plan = Plan(
        user_id=payload.user_id,
        name=payload.name,
        mode="single",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        settings={
            "schedule": [
                item.model_dump() if hasattr(item, 'model_dump') else item.dict()
                for item in payload.schedule
            ]
        } if payload.schedule else None,
    )

    db.add(new_plan)
    db.flush()

    new_semester = PlanSemester(
        plan_id=new_plan.id,
        term_season=payload.semester.term_season,
        term_year=payload.semester.term_year,
        position=0,
    )

    db.add(new_semester)
    db.flush()

    for selection in payload.courseSelections:
        course = db.query(Course).filter(Course.id == selection.course_id).first()
        if not course:
            continue

        new_selection = PlanCourseSelection(
            plan_semester_id=new_semester.id,
            course_id=selection.course_id,
            class_section_id=selection.class_section_id,
            status="planned",
            added_by="user",
        )

        db.add(new_selection)

    new_conversation = ChatConversation(
        user_id=payload.user_id,
        plan_id=new_plan.id,
        plan_semester_id=new_semester.id,
        title=payload.name,
        created_at=datetime.now(timezone.utc),
        last_message_at=datetime.now(timezone.utc),
    )

    db.add(new_conversation)
    db.flush()

    for idx, msg in enumerate(payload.messages):
        new_message = ChatMessage(
            conversation_id=new_conversation.id,
            seq=idx,
            role=msg.role,
            content=msg.content,
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_message)

    db.commit()
    db.refresh(new_plan)

    return PlanSummaryResponse(
        id=new_plan.id,
        name=new_plan.name,
        created_at=new_plan.created_at,
    )


# ----------------------------
# LIST PLANS
# ----------------------------

class PlanListResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    term_season: str
    term_year: int
    total_courses: int


@router.get("", response_model=List[PlanListResponse])
def list_plans(user_id: int, db: Session = Depends(get_db)):

    plans = (
        db.query(
            Plan.id,
            Plan.name,
            Plan.created_at,
            PlanSemester.term_season,
            PlanSemester.term_year,
            func.count(PlanCourseSelection.id).label("total_courses"),
        )
        .join(PlanSemester, PlanSemester.plan_id == Plan.id)
        .outerjoin(
            PlanCourseSelection,
            PlanCourseSelection.plan_semester_id == PlanSemester.id,
        )
        .filter(Plan.user_id == user_id)
        .group_by(Plan.id, PlanSemester.id)
        .order_by(Plan.created_at.desc())
        .all()
    )

    return plans


# ----------------------------
# DELETE PLAN
# ----------------------------

@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: int, user_id: int, db: Session = Depends(get_db)):

    plan = (
        db.query(Plan)
        .filter(Plan.id == plan_id, Plan.user_id == user_id)
        .first()
    )

    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    db.delete(plan)
    db.commit()

    return

class PlanDetailResponse(BaseModel):
    id: int
    name: str
    semester: SemesterInput
    courseSelections: List[CourseSelectionInput]
    messages: List[ChatMessageInput]
    schedule: List[ScheduleItemResponse]

# ----------------------------
# GET PLAN DETAIL
# ----------------------------
@router.get("/{plan_id}", response_model=PlanDetailResponse)
def get_plan(plan_id: int, user_id: int, db: Session = Depends(get_db)):

    plan = (
        db.query(Plan)
        .filter(Plan.id == plan_id, Plan.user_id == user_id)
        .first()
    )

    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    semester = (
        db.query(PlanSemester)
        .filter(PlanSemester.plan_id == plan.id)
        .first()
    )

    selections = (
        db.query(PlanCourseSelection)
        .filter(PlanCourseSelection.plan_semester_id == semester.id)
        .all()
    )

    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.plan_id == plan.id)
        .first()
    )

    messages = []
    if conversation:
        chat_msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.seq.asc())
            .all()
        )

        for m in chat_msgs:
            messages.append(
                ChatMessageInput(role=m.role, content=m.content)
            )

    # BUILD FULL SCHEDULE OBJECTS
    schedule_items = []

    # Map two-letter abbreviations to full day names
    DAY_MAP = {
        "Mo": "Monday",
        "Tu": "Tuesday",
        "We": "Wednesday",
        "Th": "Thursday",
        "Fr": "Friday",
        "Sa": "Saturday",
        "Su": "Sunday",
    }

    def _parse_days(day_str: str) -> list[str]:
        """Expand 'MoWeFr' → ['Monday', 'Wednesday', 'Friday']"""
        days = []
        if not day_str:
            return days
        for i in range(0, len(day_str), 2):
            abbr = day_str[i : i + 2]
            if abbr in DAY_MAP:
                days.append(DAY_MAP[abbr])
        return days

    def _format_time(t) -> str:
        """Convert a datetime.time (e.g. 09:00, 14:30) → '9:00 AM' / '2:30 PM'"""
        if t is None:
            return ""
        hour = t.hour
        minute = t.minute
        period = "AM" if hour < 12 else "PM"
        display_hour = hour % 12
        if display_hour == 0:
            display_hour = 12
        return f"{display_hour}:{minute:02d} {period}"

    for selection in selections:

        # if you have class_section_id
        if selection.class_section_id:
            section = (
                db.query(ClassSection)
                .filter(ClassSection.id == selection.class_section_id)
                .first()
            )

            if section:
                # Look up the parent course to build the class_ label
                course = (
                    db.query(Course)
                    .filter(Course.id == selection.course_id)
                    .first()
                )

                # Build a label like "1410 - 001" to match what the frontend expects
                if course:
                    class_label = f"{course.number} - {section.section_code}"
                else:
                    class_label = section.section_code

                # Expand combined days ("MoWeFr") into one schedule item per day
                expanded_days = _parse_days(section.days or "")

                for day_name in expanded_days:
                    schedule_items.append(
                        ScheduleItemResponse(
                            class_=class_label,
                            day=day_name,
                            startTime=_format_time(section.start_time),
                            endTime=_format_time(section.end_time),
                            room=section.location or "",
                            course_id=selection.course_id,
                            class_section_id=selection.class_section_id,
                        )
                    )

    # FALLBACK: if no schedule items were built from class_section lookups,
    # use the raw schedule stored in plan.settings
    if not schedule_items and plan.settings and "schedule" in plan.settings:
        for item in plan.settings["schedule"]:
            schedule_items.append(
                ScheduleItemResponse(
                    class_=item.get("class_", ""),
                    day=item.get("day", ""),
                    startTime=item.get("startTime", ""),
                    endTime=item.get("endTime", ""),
                    room=item.get("room", ""),
                    course_id=item.get("course_id") or None,
                    class_section_id=item.get("class_section_id") or None,
                )
            )

    return PlanDetailResponse(
    id=plan.id,
    name=plan.name,
    semester=SemesterInput(
        term_season=semester.term_season,
        term_year=semester.term_year,
    ),
    courseSelections=[
        CourseSelectionInput(
            course_id=s.course_id,
            class_section_id=s.class_section_id,
        )
        for s in selections
    ],
    messages=messages,
    schedule=schedule_items,
)