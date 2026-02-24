from __future__ import annotations
from typing import Optional, Iterable, Dict, List

from sqlalchemy import select, func
from sqlalchemy.orm import Session, aliased

from app.database.schema import UserAudit, AuditRequirement, AuditRequirementRule, Department, Course, UserCompletedCourse
from app.models.db_models import UserAuditRead, AuditRequirementRead, AuditSubrequirementRead, AuditRuleRead


def create_audit(db: Session, user_id: int, raw_text: Optional[str] = None) -> int:
    audit = UserAudit(user_id=user_id, raw_text=raw_text)
    db.add(audit)
    db.flush() 
    return audit.id

def commit_audit(db: Session) -> None:
    db.commit()

def _next_sort_order(db: Session, audit_id: int, parent_id: Optional[int]) -> int:
    # use to get the order, so don't have to track manually
    stmt = select(func.max(AuditRequirement.sort_order)).where(
        AuditRequirement.audit_id == audit_id
    )

    if parent_id is None:
        stmt = stmt.where(AuditRequirement.parent_id.is_(None))
    else:
        stmt = stmt.where(AuditRequirement.parent_id == parent_id)

    result = db.execute(stmt)
    max_sort = result.scalar_one_or_none()

    if max_sort is None:
        return 0
    return int(max_sort) + 1

def add_requirement(
    db: Session,
    audit_id: int,
    title: str,
    needs_count: Optional[int] = None,
    needs_credits: Optional[int] = None,
    min_grade: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> int:
    if sort_order is None:
        sort_order = _next_sort_order(db, audit_id=audit_id, parent_id=None)

    node = AuditRequirement(
        audit_id=audit_id,
        parent_id=None,
        node_type="REQUIREMENT",
        title=title,
        needs_count=needs_count,
        needs_credits=needs_credits,
        min_grade=min_grade,
        sort_order=sort_order,
    )
    db.add(node)
    db.flush()
    return node.id


def add_subrequirement(
    db: Session,
    audit_id: int,
    parent_requirement_id: int,
    title: str,
    needs_count: Optional[int] = None,
    needs_credits: Optional[int] = None,
    min_grade: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> int:
    if sort_order is None:
        sort_order = _next_sort_order(db, audit_id=audit_id, parent_id=parent_requirement_id)

    node = AuditRequirement(
        audit_id=audit_id,
        parent_id=parent_requirement_id,
        node_type="SUBREQUIREMENT",
        title=title,
        needs_count=needs_count,
        needs_credits=needs_credits,
        min_grade=min_grade,
        sort_order=sort_order,
    )
    db.add(node)
    db.flush()
    return node.id

def add_rule_course(db: Session, requirement_id: int, rule_group: str, course_id: int) -> int:  #rule_group: "ALLOW" | "BLOCK"
    rule = AuditRequirementRule(
        requirement_id=requirement_id,
        rule_group=rule_group,
        kind="COURSE",
        course_id=course_id,
        department_id=None,
        number_min=None,
        number_max=None,
    )
    db.add(rule)
    db.flush()
    return rule.id

def add_rules_courses_bulk(db: Session, requirement_id: int, rule_group: str, course_ids: Iterable[int]) -> None:
    """
    Bulk insert explicit COURSE rules.
    Faster for big allow/block lists.
    """
    rules = [
        AuditRequirementRule(
            requirement_id=requirement_id,
            rule_group=rule_group,
            kind="COURSE",
            course_id=cid,
            department_id=None,
            number_min=None,
            number_max=None,
        )
        for cid in course_ids
    ]
    db.add_all(rules)

def add_rule_range(
    db: Session,
    requirement_id: int,
    rule_group: str, # will mostly be "ALLOW", unless there is range of allowed courses in the requirement
    department_id: int,
    number_min: int,
    number_max: Optional[int],
    kind: str = "RANGE",   # or "SUBJECT_LEVEL, but will probably not use"
) -> int:
    
    rule = AuditRequirementRule(
        requirement_id=requirement_id,
        rule_group=rule_group,
        kind=kind,
        course_id=None,
        department_id=department_id,
        number_min=number_min,
        number_max=number_max,
    )
    db.add(rule)
    db.flush()
    return rule.id

# TODO: Credits for requirements should be shown
def get_audit_tree(db: Session, audit_id: int,) -> UserAuditRead:
    audit_stmt = select(UserAudit).where(UserAudit.id == audit_id)
    audit = db.execute(audit_stmt).scalar_one_or_none()
    if audit is None:
        raise ValueError(f"Audit not found: id={audit_id}")

    req_stmt = (
        select(AuditRequirement)
        .where(
            AuditRequirement.audit_id == audit_id,
            AuditRequirement.parent_id.is_(None),
        )
        .order_by(AuditRequirement.sort_order, AuditRequirement.id)
    )
    requirements = db.execute(req_stmt).scalars().all()

    sub_stmt = (
        select(AuditRequirement)
        .where(
            AuditRequirement.audit_id == audit_id,
            AuditRequirement.parent_id.is_not(None),
        )
        .order_by(AuditRequirement.parent_id, AuditRequirement.sort_order, AuditRequirement.id)
    )
    subrequirements = db.execute(sub_stmt).scalars().all()

    children_map: Dict[int, List[AuditRequirement]] = {}
    for s in subrequirements:
        children_map.setdefault(s.parent_id, []).append(s)

    rules_stmt = (
        select(
            AuditRequirementRule,
            Course.number,
            Course.name,
            Department.subject,
        )
        .select_from(AuditRequirementRule)
        .outerjoin(Course, Course.id == AuditRequirementRule.course_id)
        .outerjoin(Department, Department.id == Course.department_id)
        .where(AuditRequirementRule.requirement_id.in_(
            [r.id for r in requirements] + [s.id for s in subrequirements]
        ))
        .order_by(
            AuditRequirementRule.requirement_id,
            AuditRequirementRule.rule_group,
            AuditRequirementRule.kind,
            AuditRequirementRule.id,
        )
    )
    rules_rows = db.execute(rules_stmt).all()

    dept_ids = {
        rr.department_id
        for rr, _, _, _ in rules_rows
        if rr.department_id is not None
    }
    dept_subject_map: Dict[int, str] = {}
    if dept_ids:
        dept_stmt = select(Department.id, Department.subject).where(Department.id.in_(dept_ids))
        for did, subj in db.execute(dept_stmt).all():
            dept_subject_map[int(did)] = subj

    rules_map: Dict[int, List[AuditRuleRead]] = {}
    for rr, course_number, course_name, course_subject in rules_rows:
        course_code: Optional[str] = None
        subj: Optional[str] = None

        if rr.kind == "COURSE":
            subj = course_subject
            if subj is not None and course_number is not None:
                course_code = f"{subj} {course_number}"

        elif rr.kind in ("RANGE", "SUBJECT_LEVEL"):
            if rr.department_id is not None:
                subj = dept_subject_map.get(int(rr.department_id))

        rule_out = AuditRuleRead(
            id=rr.id,
            rule_group=rr.rule_group,
            kind=rr.kind,
            course_code=course_code,
            course_name=course_name if rr.kind == "COURSE" else None,
            subject=subj,
            number_min=rr.number_min,
            number_max=rr.number_max,
        )
        rules_map.setdefault(rr.requirement_id, []).append(rule_out)

    req_out: List[AuditRequirementRead] = []

    for r in requirements:
        sub_out: List[AuditSubrequirementRead] = []

        for s in children_map.get(r.id, []):
            srules = rules_map.get(s.id, [])

            not_from: List[str] = []
            select_from: List[str] = []

            for rule in srules:
                if rule.kind == "COURSE" and rule.course_code:
                    (select_from if rule.rule_group == "ALLOW" else not_from).append(rule.course_code)

                elif rule.kind in ("RANGE", "SUBJECT_LEVEL") and rule.subject and rule.number_min is not None:
                    if rule.number_max is None:
                        label = f"{rule.subject} {rule.number_min}+"
                    else:
                        label = f"{rule.subject} {rule.number_min} TO {rule.subject} {rule.number_max}"

                    (select_from if rule.rule_group == "ALLOW" else not_from).append(label)

            sub_out.append(
                AuditSubrequirementRead(
                    id=s.id,
                    title=s.title or "[No Title]",
                    sort_order=s.sort_order,
                    needs_count=s.needs_count,
                    needs_credits=s.needs_credits,
                    min_grade=s.min_grade,
                    not_from=not_from,
                    select_from=select_from,
                    rules=srules,
                )
            )

        req_out.append(
            AuditRequirementRead(
                id=r.id,
                title=r.title,
                sort_order=r.sort_order,
                needs_count=r.needs_count,
                needs_credits=r.needs_credits,
                subrequirements=sub_out,
            )
        )

    return UserAuditRead(
        id=audit.id,
        user_id=audit.user_id,
        created_at=audit.created_at,
        raw_text=audit.raw_text,
        requirements=req_out,
    )

def format_audit_tree_as_text(tree: UserAuditRead) -> str:
    sep = "=" * 60
    lines: List[str] = []

    for req in tree.requirements:
        lines.append(sep)
        lines.append(f"Requirement: {req.title}")
        lines.append(sep)

        for sub in req.subrequirements:
            lines.append(f"  Subrequirement: {sub.title or '[No Title]'}")

            lines.append("    Completed Courses: [I don't store this in the db, can add later if needed, will remove if not?]")   # didnt do this in db, maybe add later if needed?

            lines.append(f"    Needs Count: {sub.needs_count if sub.needs_count is not None else 'N/A'}")
            lines.append(f"    Needs Credits: {sub.needs_credits if sub.needs_credits is not None else 'N/A'}")
            lines.append(f"    Min Grade: {sub.min_grade if sub.min_grade is not None else 'N/A'}")

            lines.append(f"    Not From: {', '.join(sub.not_from) if sub.not_from else 'None'}")
            lines.append(f"    Select From: {', '.join(sub.select_from) if sub.select_from else 'None'}")
            lines.append("")

        lines.append("\n")

    return "\n".join(lines)



#========================Methods for querying completed courses for audits========================


def add_completed_course(db: Session, user_id: int, course_id: int) -> bool:
    """
    Adds user_id and course_id if its not in database.
    Will returns True if inserted, False if it already existed.
    """
    exists_stmt = select(UserCompletedCourse.id).where(
        UserCompletedCourse.user_id == user_id,
        UserCompletedCourse.course_id == course_id,
    )
    if db.execute(exists_stmt).scalar_one_or_none() is not None:
        return False

    row = UserCompletedCourse(user_id=user_id, course_id=course_id)
    db.add(row)
    db.flush()
    return True

def add_completed_courses_bulk(db: Session, user_id: int, course_ids: Iterable[int]) -> int:
    """
    Bulk add completed courses for a user, will skip ones that already exist.
    Returns number of rows that were added.
    """
    course_ids_list = list({int(cid) for cid in course_ids if cid is not None})
    if not course_ids_list:
        return 0

    existing_stmt = select(UserCompletedCourse.course_id).where(
        UserCompletedCourse.user_id == user_id,
        UserCompletedCourse.course_id.in_(course_ids_list),
    )
    existing = set(db.execute(existing_stmt).scalars().all())

    to_add = [cid for cid in course_ids_list if cid not in existing]
    if not to_add:
        return 0

    db.add_all([UserCompletedCourse(user_id=user_id, course_id=cid) for cid in to_add])
    db.flush()
    return len(to_add)

def get_completed_course_ids(db: Session, user_id: int) -> List[int]:
    """
    Returns just the list of completed course_ids for a user.
    """
    stmt = select(UserCompletedCourse.course_id).where(UserCompletedCourse.user_id == user_id)
    return list(db.execute(stmt).scalars().all())

def is_course_completed(db: Session, user_id: int, course_id: int) -> bool:
    """
    True if courses exists (meaning completed).
    """
    stmt = select(UserCompletedCourse.id).where(UserCompletedCourse.user_id == user_id, UserCompletedCourse.course_id == course_id)
    return db.execute(stmt).scalar_one_or_none() is not None

def get_completed_courses(db: Session, user_id: int) -> List[Course]:
    """
    Returns Course objects for the user's completed courses.
    """
    stmt = (
        select(Course)
        .join(UserCompletedCourse, UserCompletedCourse.course_id == Course.id)
        .where(UserCompletedCourse.user_id == user_id)
    )
    return list(db.execute(stmt).scalars().all())

