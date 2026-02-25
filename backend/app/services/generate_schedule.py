from app.database.query_routers.audit_requirements_query import get_audit_tree, get_completed_courses, is_course_completed
from app.database.query_routers.course_prerequisites_query import get_course_prerequisites_by_subject
from app.database.query_routers.departments_query import get_department
from app.database.query_routers.courses_query import get_course_id, list_courses_in_number_range, get_course_by_code
from app.database.query_routers.class_sections_query import get_class_sections_by_course_number
from scraper.audit_scraper import splitCourse
from app.database.session import SessionLocal
from app.models.models import ScheduleItem
from datetime import datetime
from app.database.schema import ClassSection
from app.database.schema import Course

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
    # If online class
    if section.section_code == "090":
            schedule.append(
            ScheduleItem(
                day="N/A", 
                startTime="N/A", 
                endTime="N/A",
                class_=course, 
                room="Online")
        )
    else:  
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

    onlineSection = None

    for section in sections:
        # Skip sections with no time or days and prioritizes in person courses rather than online
        if not section.start_time or not section.end_time or not section.days:

            if section.section_code == "090":
                onlineSection = section

            continue

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

    # If every in person section conflicts, add an online one if it exists
    if onlineSection:
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
        if not is_course_completed(db=db, user_id=1, course_id=pre_id):
            return False
    
    return True

def course_not_allowed(db, course: Course, not_from: list[str]):
    for not_course in not_from:
        #If there is a range of courses to not select from
        if "TO" in not_course:
            minCourse, maxCourse = not_course.split("TO")

            dept1, minNum = splitCourse(minCourse.strip())
            dept2, maxNum = splitCourse(maxCourse.strip())

            notRangeCourses = list_courses_in_number_range(db=db, subject=dept1, number_min=int(minNum), number_max=int(maxNum))

            for notRangeCourse in notRangeCourses:
                if course.id == notRangeCourse.id:
                    return True
        else:
            dept, num = splitCourse(not_course)

            if course.id == get_course_by_code(db=db, subject=dept, number=num).id:
                return True

    return False

def requirement_met(total_classes: int, needs_class_count: int | None, needs_credits: int | None):
    if (
    total_classes <= 0
    or (
        needs_class_count is not None
        and needs_credits is not None
        and needs_class_count <= 0
        and needs_credits <= 0
    )
    or (
        needs_class_count is not None
        and needs_credits is None
        and needs_class_count <= 0
    )
    or (
        needs_class_count is None
        and needs_credits is not None
        and needs_credits <= 0
    )
    ):
        return True

    return False

def generate_schedule(audit_id):
    db = SessionLocal()
    audit = get_audit_tree(db, audit_id)
    schedule: list[ScheduleItem] = []

    major_classes = 2
    total_classes = 4

    # First get Major specific classes
    for req in audit.requirements:
        if "Pre-Major" in req.title or "Major" in req.title or "Core" in req.title:

            for subreq in req.subrequirements:

                for course in subreq.select_from:
                    # Don't add more than the recommended amount of major specific classes
                    if major_classes <= 0:
                        break

                    # Don't add courses that do not count towards requirement
                    if course in subreq.not_from:
                        continue

                    # If prerequisites are met and there are no day and time conflicts, add the class to the schedule
                    if course_prereqs_complete(db=db, course=course):
                        conflict, section = schedule_conflict(db=db, course=course, schedule=schedule)

                        if not conflict:
                            add_class_to_schedule(course=course, section=section, schedule=schedule)

                            print("Core")

                            major_classes -= 1
                            total_classes -= 1

    # Then fill out other requirements
    for req in audit.requirements:
        # UNCOMMENT THIS
        needs_class_count = req.needs_count
        needs_credits = req.needs_credits
        
        for subreq in req.subrequirements:
            # UNCOMMENT THIS
            if needs_class_count is None:
                needs_class_count = subreq.needs_count

            if needs_credits is None:
                needs_credits = subreq.needs_credits

            # # Last reasource (maybe unnecessary)
            # if needs_credits is None:
            #     needs_credits = req["totalCredits"]

            for course in subreq.select_from:
                # Don't add more than the recommended amount of total classes or when we have met the required number of credits and/or classes for this requirement
                if requirement_met(total_classes=total_classes, needs_class_count=needs_class_count, needs_credits=needs_credits):
                    break

                # If select from contains a range of classes
                if "TO" in course:
                    min_course, max_course = course.split("TO")

                    dept1, minNum = splitCourse(min_course.strip())
                    dept2, maxNum = splitCourse(max_course.strip())

                    range_courses = list_courses_in_number_range(db=db, subject=dept1, number_min=int(minNum), number_max=int(maxNum))

                    for rangeCourse in range_courses:
                        # Don't add more than the recommended amount of total classes or when we have met the required number of credits and/or classes for this requirement
                        if requirement_met(total_classes=total_classes, needs_class_count=needs_class_count, needs_credits=needs_credits):
                            break
                        
                        # Don't add courses that do not count towards requirement
                        if course_not_allowed(db=db, course=rangeCourse, not_from=subreq.not_from):
                            continue
                        
                        # Turn the course into a string
                        course_code = dept1 + " " + rangeCourse.number

                        # Check if class is already in schedule (This would only happen if a course shows up in more than one requirement)
                        already_in_schedule = False
                        normalized_course = course_code.replace(" ", "").upper()

                        for item in schedule:
                            if item.class_.replace(" ", "").upper() == normalized_course:
                                already_in_schedule = True
                                break

                        if already_in_schedule:
                            continue

                        # If prerequisites are met and there are no day and time conflicts, add the class to the schedule
                        if course_prereqs_complete(db=db, course=course_code):
                            conflict, section = schedule_conflict(db=db, course=course_code, schedule=schedule)

                            if not conflict:
                                # print(rangeCourse.number)
                                # print(rangeCourse.name)
                                # print(rangeCourse.description)
                                # print(section.section_code)
                                # print(f"{section.start_time} - {section.end_time}")
                                # print("\n")

                                add_class_to_schedule(course=course_code, section=section, schedule=schedule)
                                
                                total_classes -= 1

                                if needs_class_count is not None:
                                    needs_class_count -= 1
                                
                                # Subtract the courses credits from the total needed credits
                                if needs_credits is not None:
                                    needs_credits -= rangeCourse.units

                                # In this case only one class should be added for this requirement
                                if needs_class_count is None and needs_credits is None:
                                    break
                else:
                    # Don't add courses that do not count towards requirement
                    dept, num = splitCourse(course)
                    course_object = get_course_by_code(db=db, subject=dept, number=num)

                    if course_not_allowed(db=db, course=course_object, not_from=subreq.not_from):
                        continue

                    # Check if class is already in schedule (This would only happen if a course shows up in more than one requirement)
                    already_in_schedule = False
                    normalized_course = course.replace(" ", "").upper()

                    for item in schedule:
                        if item.class_.replace(" ", "").upper() == normalized_course:
                            already_in_schedule = True
                            break

                    if already_in_schedule:
                        continue

                    # If prerequisites are met and there are no day and time conflicts, add the class to the schedule
                    if course_prereqs_complete(db=db, course=course):
                        conflict, section = schedule_conflict(db=db, course=course, schedule=schedule)

                        if not conflict:
                            print(dept)
                            print(course_object.number)
                            print(course_object.name)
                            print(course_object.description)
                            print(section.section_code)
                            print(f"{section.start_time} - {section.end_time}")
                            print("\n")

                            add_class_to_schedule(course=course, section=section, schedule=schedule)

                            total_classes -= 1

                            if needs_class_count is not None:
                                needs_class_count -= 1
                                
                            # Subtract the courses credits from the total needed credits
                            if needs_credits is not None:
                                needs_credits -= course_object.units

                            # In this case only one class should be added for this requirement
                            if needs_class_count is None and needs_credits is None:
                                break
    
    return schedule