from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import PlainTextResponse

from backend.scraper.audit_scraper import scrapeDegreeAudit
from backend.app.services import generate_schedule

from app.database.session import DBSession
from app.database.query_routers.audit_requirements_query import get_audit_tree, format_audit_tree_as_text
  
from app.models.db_models import CoursePrerequisiteCreate, CoursePrerequisiteRead, UserAuditRead
from app.models.models import ScheduleItem, DUMMY_SCHEDULE

router = APIRouter(prefix="/audit", tags=["audit"])

@router.post("/", status_code=201, response_model=List[ScheduleItem])
def post_degree_audit(file: UploadFile = File(...)):
    audit_id = scrapeDegreeAudit(file.file)
    schedule = generate_schedule(audit_id)

    return schedule


@router.get("/{audit_id}", response_model=UserAuditRead)
def get_audit_as_json(audit_id: int, db: DBSession) -> UserAuditRead:
    try:
        return get_audit_tree(db, audit_id=audit_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{audit_id}/easy_read_text_style", response_class=PlainTextResponse)
def get_audit_as_pretty_text(audit_id: int, db: DBSession) -> str:
    try:
        tree = get_audit_tree(db, audit_id=audit_id)
        return format_audit_tree_as_text(tree)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
