from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.models.db_models import CoursePrerequisiteCreate, CoursePrerequisiteRead
from app.models.models import ScheduleItem, DUMMY_SCHEDULE

from app.database.query_routers.course_prerequisites_query import create_course_prerequisite, list_course_prerequisites, get_course_prerequisite

from backend.exceptions import EntityNotFound

from scraper.audit_scraper import scrapeDegreeAudit

router = APIRouter(prefix="/upload-audit", tags=["audit-tag"])


@router.post("/", status_code=201, response_model=List[ScheduleItem])
def post_degree_audit(file: UploadFile = File(...)):
    reqs = scrapeDegreeAudit(file.file)

    return DUMMY_SCHEDULE

