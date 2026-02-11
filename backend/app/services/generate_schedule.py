from app.database.query_routers.audit_requirements_query import get_audit_tree, get_completed_courses, is_course_completed
from app.database.query_routers.course_prerequisites_query import get_course_prerequisites_by_subject
from app.database.query_routers.departments_query import get_department
from app.database.query_routers.courses_query import get_course_id
from app.database.query_routers.class_sections_query import get_class_sections_by_course_number
from scraper.audit_scraper import splitCourse
from app.database.session import SessionLocal
from app.models.models import ScheduleItem
from datetime import datetime
from app.database.schema import ClassSection

def convert_days(days, day_string):
    if "Mo" in day_string:
        days.append("Monday")
    if "Tu" in day_string:
        days.append("Tuesday")
    if "We" in day_string:
        days.append("Wednesday")
    if "Th" in day_string:
        days.append("Thursday")
    if "Fr" in day_string:
        days.append("Friday")

    return days

def add_class_to_schedule(course: str, section: ClassSection, schedule: list[ScheduleItem]):
    day_string = section.days
    days = convert_days([], day_string)

    start = section.start_time
    end = section.end_time

    location = section.location

    time = f"{start.strftime('%H:%M')} {end.strftime('%H:%M')}"

    # Add class to schedule
    for day in days:
        schedule.append(
            ScheduleItem(
                day=day, 
                startTime=datetime.strptime(time.split(" ")[0], "%H:%M").strftime("%-I:%M %p"), 
                endTime=datetime.strptime(time.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
                class_=course, 
                room="TBD")
        )


def schedule_conflict(db, course: str, schedule: list[ScheduleItem]):
    dept, num = splitCourse(course)
    sections = get_class_sections_by_course_number(db, num)

    for section in sections:
        days = convert_days([], section.days)

        new_start = datetime.strptime(section.start_time.strftime("%H:%M"), "%H:%M")
        new_end = datetime.strptime(section.end_time.strftime("%H:%M"), "%H:%M")

        conflict_found = False

        for item in schedule:
            # If day does not overlap
            if item.day not in days:
                continue

            existing_start = datetime.strptime(item.startTime, "%I:%M %p")
            existing_end = datetime.strptime(item.endTime, "%I:%M %p")


            # Time overlap check
            if new_start < existing_end and existing_start < new_end:
                conflict_found = True
                break

        # If no conflicts for this section, return it
        if not conflict_found:
            return False, section

    # If every section conflicts
    return True, None



def course_prereqs_complete(db, course: str):
    dept, num = splitCourse(course)

    prereqs = get_course_prerequisites_by_subject(db=db, department_subject=dept, course_number=num)

    for prereq in prereqs:
        # Get subject (I believe .subject would return 'CS')
        pre_subject = get_department(db=db, dept_id=prereq.department_id).subject

        pre_id = get_course_id(db=db, subject=pre_subject, number=prereq.number)

        # Use actual user ID that will be passed in when login is made
        if not is_course_completed(db=db, user_id=0, course_id=pre_id):
            return False
    
    return True

def generate_schedule(audit_id):
    db = SessionLocal()
    audit = get_audit_tree(db, audit_id)
    schedule: list[ScheduleItem] = []

    majorClasses = 2
    totalClasses = 4

    # First get Major specific classes
    for req in audit.requirements:
        if "Pre-Major" in req.title or "Major" in req.title:

            for subreq in req.subrequirements:

                for course in subreq.select_from:
                    # Don't add more than the recommended amount of major specific classes
                    if majorClasses <= 0:
                        break

                    # Don't add courses that do not count towards requirement
                    if course in subreq.not_from:
                        continue

                    # If prerequisites are met and there are no day and time conflicts, add the class to the schedule
                    if course_prereqs_complete(db=db, course=course):
                        conflict, section = schedule_conflict(db=db, course=course, schedule=schedule)

                        if not conflict:
                            add_class_to_schedule(course=course, section=section, schedule=schedule)

                            majorClasses -= 1
                            totalClasses -= 1

    # Then fill out other requirements
    for req in audit.requirements:
        # Don't double check major requirements
        if "Pre-Major" in req.title or "Major" in req.title:
            continue

        for subreq in req.subrequirements:

            for course in subreq.select_from:
                # Don't add more than the recommended amount of total classes
                if totalClasses <= 0:
                    break

                # Check if class is already in schedule (This would only happen if a course shows up in more than one requirement)
                already_in_schedule = False
                normalized_course = course.replace(" ", "").upper()

                for item in schedule:
                    if item.class_.replace(" ", "").upper() == normalized_course:
                        already_in_schedule = True
                        break

                if already_in_schedule:
                    continue
                
                # Don't add courses that do not count towards requirement
                if course in subreq.not_from:
                    continue

                # If prerequisites are met and there are no day and time conflicts, add the class to the schedule
                if course_prereqs_complete(db=db, course=course):
                    conflict, section = schedule_conflict(db=db, course=course, schedule=schedule)

                    if not conflict:
                        add_class_to_schedule(course=course, section=section, schedule=schedule)

                        totalClasses -= 1
    
    return schedule