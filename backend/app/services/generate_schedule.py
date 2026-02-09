from backend.app.database.query_routers.audit_requirements_query import get_audit_tree, get_completed_courses, is_course_completed
from backend.app.database.query_routers.course_prerequisites_query import get_course_prerequisites_by_subject
from backend.app.database.query_routers.courses_query import get_course_by_code
from backend.app.database.query_routers.courses_query import list_courses_in_number_range
from backend.app.database.query_routers.courses_query import get_course_id
from backend.app.database.query_routers.class_sections_query import get_class_sections_by_course_number
from backend.scraper.audit_scraper import splitCourse
from app.database.session import SessionLocal
from app.models.models import ScheduleItem
from datetime import datetime



def convert_days(days, day_string):
    if day_string == "MoWe":
        days.append("Monday")
        days.append("Wednesday")
    elif day_string == "TuTh":
        days.append("Tuesday")
        days.append("Thursday")
    elif day_string == "MoWeFr":
        days.append("Monday")
        days.append("Wednesday")
        days.append("Friday")
    return days

def add_class_to_schedule(db, course, schedule):
    dept, num = splitCourse(course)
    section = get_class_sections_by_course_number(db, num)
    day_string = section[0].days

    days = []
    days = convert_days(days, day_string)

    location = section[0].location

    # Add class to schedule
    time = f"{section[0].start_time.strftime('%H:%M')} {section[0].end_time.strftime('%H:%M')}"
    for day in days:
        schedule.append(
            ScheduleItem(
                day=day, 
                startTime=datetime.strptime(time.split(" ")[0], "%H:%M").strftime("%-I:%M %p"), 
                endTime=datetime.strptime(time.split(" ")[1], "%H:%M").strftime("%-I:%M %p"),
                class_=course, 
                room="TBD")
        )

def generate_schedule(audit_id):
    db = SessionLocal()
    audit = get_audit_tree(db, audit_id)
    schedule: list[ScheduleItem] = []

    majorClasses = 2
    totalClasses = 4

    for req in audit.requirements:
        if "Pre-Major" in req.title:

            for subreq in req.subrequirements:

                for course in subreq.select_from:

                    # If prerequisites are met, add the class to the schedule

def test_class_prereqs(db, course):
    dept, num = splitCourse(course)

    prereqs = get_course_prerequisites_by_subject(db=db, department_subject=dept, course_number=num)

    for prereq in prereqs:
        # Get subject and number id

        pre_id = get_course_id(db=db, subject=, number=)

        # Use actual user ID that will be passed in when login is made
        if not is_course_completed(db=db, user_id=0, course_id=pre_id):
            return False
    
    return True



    # for requirement in audit.requirements:
    #     if "Capstone" in requirement.title:

    #         for subreq in requirement.subrequirements:

    #             if "Project" in subreq.title:

    #                 for course in subreq.select_from:

    #                     if "4500" in course:
    #                         print("FOUND CAPSTONE")
    #                         print(course)
    #                         add_class_to_schedule(db, course, schedule)
    #                         for c in schedule:
    #                             print(c.class_)

    #     if "Computer Science Electives" in requirement.title:
            
    #         for subreq in requirement.subrequirements:
    #             if "[No Title]" in subreq.title:
    #                 rules = subreq.rules
    #                 for rule in rules:
    #                     if rule.kind == "RANGE":
    #                         min_class = rule.number_min
    #                         max_class = rule.number_max
    #                         rule_subject = rule.subject
    #                         courses = list_courses_in_number_range(db, rule_subject, min_class, max_class)
    #                         for course in courses:


    #                             if course.number == "5955" or course.number == "4530" or course.number == "3090":
    #                                 add_class_to_schedule(db, rule_subject + " " + course.number, schedule)
    #     #print(schedule)
    # return schedule

        # needs = 0
        # credits = 0



        # # If subrequirement is based on credits to take
        # if subreq.needs_credits is not None:
        #     for course in subreq.select_from:

        #         # Only add courses that are not prohibited
        #         if course not in subreq.not_from:
        #             if credits >= subreq.needs_credits:
        #                 break

        #             dept, num = splitCourse(course)

        #             possible_class = get_course_by_code(dept, num)

        #             # If the class exists in the catalog
        #             if possible_class is not None:
        #                 # Add class to schedule

        #                 credits += 1 # change to number of credits
        #                 classes_num += 1
                        
        #     continue

        # # If subrequirement is based on number of classes to take (needs count)
        # if subreq.needs_count is not None:
        #     for course in subreq.select_from:

        #         # Only add courses that are not prohibited
        #         if course not in subreq.not_from:
        #             if needs >= subreq.needs_count:
        #                 break

        #             dept, num = splitCourse(course)

        #             possible_class = get_course_by_code(dept, num)

        #             # If the class exists in the catalog
        #             if possible_class is not None:
        #                 # Add class to schedule

        #                 needs += 1
        #                 classes_num += 1

    return schedule