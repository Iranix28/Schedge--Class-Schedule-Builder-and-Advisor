from backend.app.database.query_routers.audit_requirements_query import get_audit_tree
from backend.app.database.query_routers.courses_query import get_course_by_code
from backend.app.database.query_routers.courses_query import list_courses_in_number_range
from backend.app.database.query_routers.class_sections_query import get_class_sections_by_course_number
from backend.scraper.audit_scraper import splitCourse
from app.database.session import SessionLocal
from app.models.models import ScheduleItem

def convert_days(days, day_string):
    if day_string == "MWF":
        days.append("Monday")
        days.append("Wednesday")
        days.append("Friday")
    elif day_string == "TuTh":
        days.append("Tuesday")
        days.append("Thursday")

def add_class_to_schedule(course, schedule, db):
    dept, num = splitCourse(course)

    section = get_class_sections_by_course_number(db, num)

    day_string = section.days
    days = []

    convert_days(days, day_string)

    start = section.start_time
    end = section.end_time
    location = section.location

    # Add class to schedule
    for day in days:
        schedule.append(ScheduleItem(day, start, end, course, location))

def generate_schedule(audit_id):
    db = SessionLocal()
    audit = get_audit_tree(db, audit_id)
    schedule: list[ScheduleItem] = []

    for requirement in audit.requirements:
        if "Major Requirements" in requirement.title:

            subreq = requirement.subrequirements[0]

            course = subreq.select_from[0]

            add_class_to_schedule(course, schedule, db)

        if "Capstone" in requirement.title:

            for subreq in requirement.subrequirements:

                if "Project" in subreq.title:

                    for course in subreq.select_from:

                        if "4000" in course:
                            add_class_to_schedule(course, schedule, db)

        if "Computer Science Electives" in requirement.title:
            
            for subreq in requirement.subrequirements:

                if "[No Title]" in subreq.title:
                    first = subreq.select_from[0]
                    second = subreq.select_from[1]

                    dept1, num1 = splitCourse(first)
                    dept2, num2 = splitCourse(second)

                    courses = []
                    if num1 < num2:
                        courses = list_courses_in_number_range(dept1, num1, num2)
                    else:
                        course = list_courses_in_number_range(dept1, num2, num1)

                    for course in courses:
                        if course == "5150" or courses == "4300":
                            add_class_to_schedule(dept1 + " " + course, schedule, db)

        return schedule



                    



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