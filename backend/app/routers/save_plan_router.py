from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.database.session import SessionLocal
from sqlalchemy import func
from app import models as db_models
from pydantic import BaseModel

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


class PlanCreateRequest(BaseModel):
    user_id: int
    name: str
    semester: SemesterInput
    courseSelections: List[CourseSelectionInput] = []
    messages: List[ChatMessageInput] = []


class PlanSummaryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime


# ----------------------------
# Route
# ----------------------------

@router.post("", response_model=PlanSummaryResponse)
def save_plan(payload: PlanCreateRequest, db: Session = Depends(get_db)):

    user = db.query(db_models.User).filter(
        db_models.User.id == payload.user_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 1️⃣ Create Plan
    new_plan = db_models.Plan(
        user_id=payload.user_id,
        name=payload.name,
        mode="single",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db.add(new_plan)
    db.flush()  # get new_plan.id

    # 2️⃣ Create Semester
    new_semester = db_models.PlanSemester(
        plan_id=new_plan.id,
        term_season=payload.semester.term_season,
        term_year=payload.semester.term_year,
        position=0,
    )

    db.add(new_semester)
    db.flush()

    # 3️⃣ Add Course Selections (optional)
    for selection in payload.courseSelections:
        course = db.query(db_models.Course).filter(
            db_models.Course.id == selection.course_id
        ).first()

        if not course:
            continue

        new_selection = db_models.PlanCourseSelection(
            plan_semester_id=new_semester.id,
            course_id=selection.course_id,
            class_section_id=selection.class_section_id,
            status="planned",
            added_by="user",
        )

        db.add(new_selection)

    # 4️⃣ Create Chat Conversation
    new_conversation = db_models.ChatConversation(
        user_id=payload.user_id,
        plan_id=new_plan.id,
        plan_semester_id=new_semester.id,
        title=payload.name,
        created_at=datetime.now(timezone.utc),
        last_message_at=datetime.now(timezone.utc),
    )

    db.add(new_conversation)
    db.flush()

    # 5️⃣ Add Messages
    for idx, msg in enumerate(payload.messages):
        new_message = db_models.ChatMessage(
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
            db_models.Plan.id,
            db_models.Plan.name,
            db_models.Plan.created_at,
            db_models.PlanSemester.term_season,
            db_models.PlanSemester.term_year,
            func.count(db_models.PlanCourseSelection.id).label("total_courses"),
        )
        .join(
            db_models.PlanSemester,
            db_models.PlanSemester.plan_id == db_models.Plan.id,
        )
        .outerjoin(
            db_models.PlanCourseSelection,
            db_models.PlanCourseSelection.plan_semester_id
            == db_models.PlanSemester.id,
        )
        .filter(db_models.Plan.user_id == user_id)
        .group_by(
            db_models.Plan.id,
            db_models.PlanSemester.id,
        )
        .order_by(db_models.Plan.created_at.desc())
        .all()
    )

    return plans
