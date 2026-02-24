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
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ----------------------------
# Schemas
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


class ScheduleItemResponse(BaseModel):
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


class MultiSemesterInput(BaseModel):
    term_season: str
    term_year: int
    courses: List[CourseSelectionInput] = []


class MultiPlanCreateRequest(BaseModel):
    user_id: int
    name: str
    semesters: List[MultiSemesterInput]


class SemesterUpdateRequest(BaseModel):
    user_id: int
    plan_name: Optional[str] = None  # if provided, update the plan's name too
    courseSelections: List[CourseSelectionInput] = []
    messages: List[ChatMessageInput] = []
    schedule: List[ScheduleItemInput] = []


class PlanSummaryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    semester_db_id: Optional[int] = None


class PlanListResponse(BaseModel):
    id: int
    name: str
    updated_at: datetime
    term_season: str
    term_year: int
    total_courses: int
    semester_count: int
    mode: str


class PlanDetailResponse(BaseModel):
    id: int
    name: str
    mode: str
    semester_db_id: Optional[int] = None
    semester: SemesterInput
    courseSelections: List[CourseSelectionInput]
    messages: List[ChatMessageInput]
    schedule: List[ScheduleItemResponse]


class SemesterDetailResponse(BaseModel):
    id: int
    term_season: str
    term_year: int
    position: int
    courses: List[CourseSelectionInput]
    messages: List[ChatMessageInput] = []
    schedule: List[ScheduleItemResponse] = []


class MultiPlanDetailResponse(BaseModel):
    id: int
    name: str
    mode: str
    semesters: List[SemesterDetailResponse]


# ----------------------------
# POST /plans  — save single-semester plan
# ----------------------------

@router.post("", response_model=PlanSummaryResponse)
def save_plan(payload: PlanCreateRequest, db: Session = Depends(get_db)):
    try:
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
            db.add(PlanCourseSelection(
                plan_semester_id=new_semester.id,
                course_id=selection.course_id,
                class_section_id=selection.class_section_id,
                status="planned",
                added_by="user",
            ))

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
            db.add(ChatMessage(
                conversation_id=new_conversation.id,
                seq=idx,
                role=msg.role,
                content=msg.content,
                created_at=datetime.now(timezone.utc),
            ))

        db.commit()
        db.refresh(new_plan)
        db.refresh(new_semester)

        return PlanSummaryResponse(
            id=new_plan.id,
            name=new_plan.name,
            created_at=new_plan.created_at,
            semester_db_id=new_semester.id,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save plan: {str(e)}")


# ----------------------------
# POST /plans/multi  — save multi-semester plan
# NOTE: must be before GET /{plan_id}
# ----------------------------

@router.post("/multi", response_model=PlanSummaryResponse)
def save_multi_plan(payload: MultiPlanCreateRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_plan = Plan(
            user_id=payload.user_id,
            name=payload.name,
            mode="multi",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        db.add(new_plan)
        db.flush()

        for position, sem_input in enumerate(payload.semesters):
            new_semester = PlanSemester(
                plan_id=new_plan.id,
                term_season=sem_input.term_season,
                term_year=sem_input.term_year,
                position=position,
            )
            db.add(new_semester)
            db.flush()

            for selection in sem_input.courses:
                course = db.query(Course).filter(Course.id == selection.course_id).first()
                if not course:
                    continue
                db.add(PlanCourseSelection(
                    plan_semester_id=new_semester.id,
                    course_id=selection.course_id,
                    class_section_id=selection.class_section_id,
                    status="planned",
                    added_by="user",
                ))

        db.commit()
        db.refresh(new_plan)

        return PlanSummaryResponse(
            id=new_plan.id,
            name=new_plan.name,
            created_at=new_plan.created_at,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save multi plan: {str(e)}")


# ----------------------------
# PUT /plans/multi/{plan_id}  — update existing multi-semester plan
# NOTE: must be before GET /{plan_id}
# ----------------------------

@router.put("/multi/{plan_id}", response_model=PlanSummaryResponse)
def update_multi_plan(plan_id: int, payload: MultiPlanCreateRequest, db: Session = Depends(get_db)):
    try:
        plan = db.query(Plan).filter(Plan.id == plan_id, Plan.user_id == payload.user_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Update name
        plan.name = payload.name
        plan.updated_at = datetime.now(timezone.utc)

        # Get existing semesters ordered by position
        existing_semesters = (
            db.query(PlanSemester)
            .filter(PlanSemester.plan_id == plan_id)
            .order_by(PlanSemester.position)
            .all()
        )

        # Update existing semesters or add new ones
        for position, sem_input in enumerate(payload.semesters):
            if position < len(existing_semesters):
                # Update existing semester term (preserve its id so chat history stays intact)
                existing_semesters[position].term_season = sem_input.term_season
                existing_semesters[position].term_year = sem_input.term_year
                existing_semesters[position].position = position
            else:
                # Add new semester
                new_semester = PlanSemester(
                    plan_id=plan_id,
                    term_season=sem_input.term_season,
                    term_year=sem_input.term_year,
                    position=position,
                )
                db.add(new_semester)

        # Remove extra semesters if user deleted some
        if len(existing_semesters) > len(payload.semesters):
            for sem in existing_semesters[len(payload.semesters):]:
                db.query(PlanCourseSelection).filter(
                    PlanCourseSelection.plan_semester_id == sem.id
                ).delete(synchronize_session=False)
                db.query(ChatMessage).filter(
                    ChatMessage.conversation_id.in_(
                        db.query(ChatConversation.id).filter(
                            ChatConversation.plan_semester_id == sem.id
                        )
                    )
                ).delete(synchronize_session=False)
                db.query(ChatConversation).filter(
                    ChatConversation.plan_semester_id == sem.id
                ).delete(synchronize_session=False)
                db.delete(sem)

        db.commit()
        db.refresh(plan)

        return PlanSummaryResponse(
            id=plan.id,
            name=plan.name,
            created_at=plan.created_at,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update multi plan: {str(e)}")


# ----------------------------
# GET /plans/multi/{plan_id}  — get multi-semester plan detail
# NOTE: must be before GET /{plan_id}
# ----------------------------

@router.get("/multi/{plan_id}", response_model=MultiPlanDetailResponse)
def get_multi_plan(plan_id: int, user_id: int, db: Session = Depends(get_db)):

    plan = (
        db.query(Plan)
        .filter(Plan.id == plan_id, Plan.user_id == user_id, Plan.mode == "multi")
        .first()
    )

    if not plan:
        raise HTTPException(status_code=404, detail="Multi-semester plan not found")

    semesters = (
        db.query(PlanSemester)
        .filter(PlanSemester.plan_id == plan.id)
        .order_by(PlanSemester.position)
        .all()
    )

    result_semesters = []
    for sem in semesters:
        selections = (
            db.query(PlanCourseSelection)
            .filter(PlanCourseSelection.plan_semester_id == sem.id)
            .all()
        )

        # Load messages for this semester's conversation
        conversation = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.plan_id == plan.id,
                ChatConversation.plan_semester_id == sem.id,
            )
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
            messages = [ChatMessageInput(role=m.role, content=m.content) for m in chat_msgs]

        # Load schedule from plan settings keyed by semester id
        settings = plan.settings or {}
        semester_schedules = settings.get("semester_schedules", {})
        raw_schedule = semester_schedules.get(str(sem.id), [])
        schedule = [
            ScheduleItemResponse(
                class_=item.get("class_", ""),
                day=item.get("day", ""),
                startTime=item.get("startTime", ""),
                endTime=item.get("endTime", ""),
                room=item.get("room", ""),
                course_id=item.get("course_id") or None,
                class_section_id=item.get("class_section_id") or None,
            )
            for item in raw_schedule
        ]

        result_semesters.append(
            SemesterDetailResponse(
                id=sem.id,
                term_season=sem.term_season,
                term_year=sem.term_year,
                position=sem.position,
                courses=[
                    CourseSelectionInput(
                        course_id=s.course_id,
                        class_section_id=s.class_section_id,
                    )
                    for s in selections
                ],
                messages=messages,
                schedule=schedule,
            )
        )

    return MultiPlanDetailResponse(
        id=plan.id,
        name=plan.name,
        mode=plan.mode,
        semesters=result_semesters,
    )


# ----------------------------
# POST /plans/{plan_id}/semesters  — add a new semester to an existing plan
# ----------------------------

class AddSemesterRequest(BaseModel):
    user_id: int
    term_season: str
    term_year: int

class AddSemesterResponse(BaseModel):
    semester_db_id: int

@router.post("/{plan_id}/semesters", response_model=AddSemesterResponse, status_code=201)
def add_semester(plan_id: int, payload: AddSemesterRequest, db: Session = Depends(get_db)):
    try:
        plan = db.query(Plan).filter(Plan.id == plan_id, Plan.user_id == payload.user_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Get next position
        existing_count = db.query(PlanSemester).filter(PlanSemester.plan_id == plan_id).count()

        new_semester = PlanSemester(
            plan_id=plan_id,
            term_season=payload.term_season,
            term_year=payload.term_year,
            position=existing_count,
        )
        db.add(new_semester)
        db.commit()
        db.refresh(new_semester)
        return AddSemesterResponse(semester_db_id=new_semester.id)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add semester: {str(e)}")


# ----------------------------
# PUT /plans/{plan_id}/semesters/{semester_id}  — autosave a semester
# NOTE: must be before GET /{plan_id}
# ----------------------------

@router.put("/{plan_id}/semesters/{semester_id}", status_code=200)
def update_semester(
    plan_id: int,
    semester_id: int,
    payload: SemesterUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        plan = (
            db.query(Plan)
            .filter(Plan.id == plan_id, Plan.user_id == payload.user_id)
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Update plan name if the user renamed it
        if payload.plan_name and payload.plan_name.strip() and payload.plan_name.strip() != plan.name:
            plan.name = payload.plan_name.strip()

        semester = (
            db.query(PlanSemester)
            .filter(PlanSemester.id == semester_id, PlanSemester.plan_id == plan_id)
            .first()
        )
        if not semester:
            raise HTTPException(status_code=404, detail="Semester not found")

        # Replace course selections — flush the DELETE before inserting new rows
        # to avoid unique-constraint collisions on uq_plan_sem_course
        db.query(PlanCourseSelection).filter(
            PlanCourseSelection.plan_semester_id == semester_id
        ).delete(synchronize_session=False)
        db.flush()

        seen = set()
        for sel in payload.courseSelections:
            key = (sel.course_id, sel.class_section_id)
            if key in seen:
                continue
            seen.add(key)
            course = db.query(Course).filter(Course.id == sel.course_id).first()
            if not course:
                continue
            db.add(PlanCourseSelection(
                plan_semester_id=semester_id,
                course_id=sel.course_id,
                class_section_id=sel.class_section_id,
                status="planned",
                added_by="user",
            ))

        # Replace conversation messages
        conversation = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.plan_id == plan_id,
                ChatConversation.plan_semester_id == semester_id,
            )
            .first()
        )

        if not conversation:
            conversation = ChatConversation(
                user_id=payload.user_id,
                plan_id=plan_id,
                plan_semester_id=semester_id,
                title=plan.name,
                created_at=datetime.now(timezone.utc),
                last_message_at=datetime.now(timezone.utc),
            )
            db.add(conversation)
            db.flush()

        # DELETE old messages first and flush before inserting new ones
        # to avoid unique-constraint collisions on uq_chat_msg_seq
        db.query(ChatMessage).filter(
            ChatMessage.conversation_id == conversation.id
        ).delete(synchronize_session=False)
        db.flush()

        for idx, msg in enumerate(payload.messages):
            db.add(ChatMessage(
                conversation_id=conversation.id,
                seq=idx,
                role=msg.role,
                content=msg.content,
                created_at=datetime.now(timezone.utc),
            ))

        conversation.last_message_at = datetime.now(timezone.utc)

        # Store schedule in plan settings keyed by semester_id
        settings = dict(plan.settings) if plan.settings else {}
        semester_schedules = dict(settings.get("semester_schedules", {}))
        semester_schedules[str(semester_id)] = [
            item.model_dump() if hasattr(item, "model_dump") else item.dict()
            for item in payload.schedule
        ]
        settings["semester_schedules"] = semester_schedules
        plan.settings = settings
        plan.updated_at = datetime.now(timezone.utc)

        db.commit()
        return {"ok": True}

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save semester: {str(e)}")


# ----------------------------
# GET /plans  — list all plans
# ----------------------------

@router.get("", response_model=List[PlanListResponse])
def list_plans(user_id: int, db: Session = Depends(get_db)):

    # Get all plans for user, ordered by most recently updated
    plans = (
        db.query(Plan)
        .filter(Plan.user_id == user_id)
        .order_by(Plan.updated_at.desc())
        .all()
    )

    result = []
    for plan in plans:
        semesters = (
            db.query(PlanSemester)
            .filter(PlanSemester.plan_id == plan.id)
            .all()
        )
        semester_count = len(semesters)
        total_courses = sum(
            db.query(func.count(PlanCourseSelection.id))
            .filter(PlanCourseSelection.plan_semester_id == sem.id)
            .scalar() or 0
            for sem in semesters
        )
        first_sem = semesters[0] if semesters else None
        result.append(PlanListResponse(
            id=plan.id,
            name=plan.name,
            updated_at=plan.updated_at,
            mode=plan.mode,
            term_season=first_sem.term_season if first_sem else "",
            term_year=first_sem.term_year if first_sem else 0,
            total_courses=total_courses,
            semester_count=semester_count,
        ))

    return result



# ----------------------------
# PATCH /plans/{plan_id}/name  — update plan name only
# ----------------------------

class PlanNameUpdateRequest(BaseModel):
    user_id: int
    name: str

@router.patch("/{plan_id}/name", status_code=200)
def update_plan_name(plan_id: int, payload: PlanNameUpdateRequest, db: Session = Depends(get_db)):
    try:
        plan = db.query(Plan).filter(Plan.id == plan_id, Plan.user_id == payload.user_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        plan.name = payload.name.strip()
        plan.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"id": plan.id, "name": plan.name}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update plan name: {str(e)}")


# ----------------------------
# DELETE /plans/{plan_id}
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


# ----------------------------
# GET /plans/{plan_id}  — single-semester plan detail
# NOTE: keep this LAST among all /{plan_id} routes
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
            messages.append(ChatMessageInput(role=m.role, content=m.content))

    DAY_MAP = {
        "Mo": "Monday", "Tu": "Tuesday", "We": "Wednesday",
        "Th": "Thursday", "Fr": "Friday", "Sa": "Saturday", "Su": "Sunday",
    }

    def _parse_days(day_str: str) -> list[str]:
        days = []
        if not day_str:
            return days
        for i in range(0, len(day_str), 2):
            abbr = day_str[i:i + 2]
            if abbr in DAY_MAP:
                days.append(DAY_MAP[abbr])
        return days

    def _format_time(t) -> str:
        if t is None:
            return ""
        hour = t.hour
        minute = t.minute
        period = "AM" if hour < 12 else "PM"
        display_hour = hour % 12
        if display_hour == 0:
            display_hour = 12
        return f"{display_hour}:{minute:02d} {period}"

    schedule_items = []

    for selection in selections:
        if selection.class_section_id:
            section = (
                db.query(ClassSection)
                .filter(ClassSection.id == selection.class_section_id)
                .first()
            )
            if section:
                course = (
                    db.query(Course)
                    .filter(Course.id == selection.course_id)
                    .first()
                )
                class_label = (
                    f"{course.number} - {section.section_code}" if course
                    else section.section_code
                )
                for day_name in _parse_days(section.days or ""):
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
        mode=plan.mode,
        semester_db_id=semester.id,
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