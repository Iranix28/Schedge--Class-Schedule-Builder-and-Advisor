from bs4 import BeautifulSoup
import os
from backend.app.database.query_routers.audit_requirements_query import *
from backend.app.database.query_routers.courses_query import get_course_id
from backend.app.database.query_routers.departments_query import get_department_id
from app.database.session import SessionLocal
import re

db = SessionLocal()

def splitCourse(course):
    splitIndex = 0

    for i in range(len(course)):
        if course[i].isdigit():
            splitIndex = i
            break

    # Get the department from the string
    dept = course[:splitIndex].strip()

    # Get the course number from the string
    num  = course[splitIndex:].strip()        

    return dept, num

def outputRequirements(requirements, filename="parsed_audit.txt"):
    """
    Takes in a list of all the requirements and outputs it
    a readable friendly way to a text file.
    Useful for testing

    """
    
    auditId = create_audit(db, 0)

    lines = []

    for req in requirements:
        # DB
        reqId = add_requirement(db, auditId, req["title"], needs_credits = req["needsCredits"] or None)

        lines.append("=" * 60)
        lines.append(f"Requirement: {req['title']}")
        lines.append("=" * 60)

        for sub in req["subrequirements"]:
            # DB
            subReqId = add_subrequirement(db, auditId, reqId, sub['title'] or "[No Title]", sub["needsCount"] or None, sub["needsCredits"] or None)

            lines.append(f"  Subrequirement: {sub['title'] or '[No Title]'}")

            # Completed courses
            if sub["completedCourses"]:
                lines.append("    Completed Courses:")
                for code, name in sub["completedCourses"].items():
                    lines.append(f"      - {code}: {name}")
            else:
                lines.append("    Completed Courses: None")

            # Needs count
            lines.append(f"    Needs Count: {sub['needsCount'] or 'N/A'}")

            # DB Not From
            courseIds = []
            for course in sub["notFrom"]:
                dept, num = splitCourse(course)

                courseIds.append(get_course_id(db, dept, num))
            
            for course in sub["completedCourses"]:
                dept, num = splitCourse(course)

                courseIds.append(get_course_id(db, dept, num))

            if courseIds:
                add_rules_courses_bulk(db, subReqId, "BLOCK", courseIds)
            
            # Not from courses
            if sub["notFrom"]:
                not_from_str = ", ".join(sub["notFrom"])
                lines.append(f"    Not From: {not_from_str}")
            else:
                lines.append("    Not From: None")

            # DB Select From
            courseIds = []
            for course in sub["selectFrom"]:
                dept, num = splitCourse(course)

                courseIds.append(get_course_id(db, dept, num))

            for i in range(len(sub["selectFrom"])):
                if i < len(sub["selectFrom"]) - 1 and sub["selectFrom"][i + 1] == "TO":
                    dept1, num1 = splitCourse(sub["selectFrom"][i])
                    dept2, num2 = splitCourse(sub["selectFrom"][i + 2])


                    add_rule_range(db, subReqId, "ALLOW", get_department_id(db, dept1), num1, num2)

            if courseIds:
                add_rules_courses_bulk(db, subReqId, "ALLOW", courseIds)

            # Select from courses
            if sub["selectFrom"]:
                select_from_str = ", ".join(sub["selectFrom"])
                lines.append(f"    Select From: {select_from_str}")
            else:
                lines.append("    Select From: None")

            # blank line between subrequirements
            lines.append("")

        lines.append("\n")

    # Make output file appear next to this .py file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, filename)

    # Write file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    commit_audit(db)

    return auditId

def extractCourseInfo(element):
    """
    Extracts department, number, and name from a list of (completed) courses in the audit
    """

    course_td = element.find("td", class_="course")
    if course_td:
        # Normalize spacing inside the code
        code = " ".join(course_td.get_text(strip=True).split())
    else:
        code = None

    # Get the course name lives
    desc_td = element.select_one("td.description td.descLine")
    if desc_td:
        name = desc_td.get_text(strip=True)
    else:
        name = None

    return code, name

def scrapeDegreeAudit(html_file):
    """
    Takes an uploaded HTML file and returns a list that
    contains the requirements that must still be completed

    Return list has the format
    [
        {
            "title": "...",
            "subrequirements": [
                {
                    title": "...",
                    "completedCourses": { "CS 3190": "Found. of Data Analysis", ... },
                    "needsCount": "...",
                    "notFrom": ["CS 3011", "CS 3020", ...],
                    "selectFrom": ["CS 3000", "CS 5999", ...]
                }
            ]
        }
    ]

    """

    # Read file contents
    if hasattr(html_file, "read"):  
        contents = html_file.read()
        try:
            contents = contents.decode("utf-8")
        except AttributeError:
            pass
    else:
        # Assume it's a file path
        with open(html_file, "r", encoding="utf-8") as f:
            contents = f.read()

    soup = BeautifulSoup(contents, "html.parser")
    requirements = soup.find_all("div", class_="requirement")

    parsedRequirements = []

    # Skip first 8 irrelevant requirements
    for idx, req in enumerate(requirements):
        if idx < 8:
            continue

        titleTag = req.find("div", class_="reqTitle")
        statusTag = req.find("div", class_="status")

        if not titleTag or not statusTag:
            continue

        title = titleTag.get_text(strip=True)
        status = statusTag.get_text(strip=True)

        match = re.search(r'(\d+)\s*credits', title, re.IGNORECASE)

        credits = int(match.group(1)) if match else None


        requirement_obj = {
            "title": title,
            "needsCredits": credits,
            "subrequirements": []
        }

        # Only get unfulfilled reqquirements
        if "Unfulfilled" not in status:
            continue  

        subreqs = req.find_all("div", class_="subrequirement")

        for sub in subreqs:

            # Get subrequirement title
            subTitleTag = sub.select_one(".subreqTitle")
            subTitle = None
            subCredits = None

            if subTitleTag:
                subTitle = subTitleTag.get_text(strip=True)
                match = re.search(r'(\d+)\s*credits', subTitle, re.IGNORECASE)

                subCredits = int(match.group(1)) if match else None


            # Completed courses inside the not fully completed requirement
            completedCourses = {}
            completedTag = sub.select(".completedCourses tr.takenCourse")

            for course in completedTag:
                code, name = extractCourseInfo(course)

                if code:
                    completedCourses[code] = name

            # Number of courses to take to meet this requirement
            needsTag = sub.select_one(".subreqNeeds .count")
            needsCount = None

            if needsTag:
                needsCount = needsTag.get_text(strip=True)

            # Do not select from these courses
            notFromList = []
            notCoursesTag = sub.select(".notcourses .course")

            dept = ""
            for course in notCoursesTag:
                text = course.get_text(strip=True)

                # Checks if the course number is actually a department since HTML is not consistent
                if text and text[0].isalpha():
                    # Find first digit in the string
                    splitIndex = 0
                    for i in range(len(text)):
                        if text[i].isdigit():
                            splitIndex = i
                            break

                    # Get the department from the string
                    dept = text[:splitIndex].strip()

                    # Get the course number from the string
                    num  = text[splitIndex:].strip()        

                    notFromList.append(f"{dept} {num}")
                    continue

                # If the text if just the course number, add it with the saved department
                notFromList.append(f"{dept} {text}")

            # Select from these courses
            selectCoursesTag = sub.select(".selectcourses .course")
            selectFromList = []

            dept = ""
            lastWasRangeStart = False

            for course in selectCoursesTag:
                text = course.get_text(strip=True)

                # Checks if the course number is actually a department since HTML is not consistent
                if text and text[0].isalpha():
                    # Find first digit in the string
                    splitIndex = 0
                    for i in range(len(text)):
                        if text[i].isdigit():
                            splitIndex = i
                            break

                    # Get the department from the string
                    dept = text[:splitIndex].strip()

                    # Get the course number from the string
                    num = text[splitIndex:].strip()

                    selectFromList.append(f"{dept} {num}")
                    lastWasRangeStart = "range" in course.get("class", [])
                    continue

                # If the text is just the course number
                selectFromList.append(f"{dept} {text}")

                # Insert "TO" if this is the start of a range
                if lastWasRangeStart:
                    selectFromList.insert(-1, "TO")
                    lastWasRangeStart = False


            # Add subrequirement object
            requirement_obj["subrequirements"].append({
                "title": subTitle,
                "completedCourses": completedCourses,
                "needsCount": needsCount,
                "needsCredits": subCredits,
                "notFrom": notFromList,
                "selectFrom": selectFromList
            })

        parsedRequirements.append(requirement_obj)

    # Returns the audit ID to the router
    return outputRequirements(parsedRequirements)