from bs4 import BeautifulSoup

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

        requirement_obj = {
            "title": title,
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

            if subTitleTag:
                subTitle = subTitleTag.get_text(strip=True)

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
                    num  = text[splitIndex:].strip()        

                    selectFromList.append(f"{dept} {num}")
                    continue

                # If the text if just the course number, add it with the saved department
                selectFromList.append(f"{dept} {text}")

            # Add subrequirement object
            requirement_obj["subrequirements"].append({
                "title": subTitle,
                "completedCourses": completedCourses,
                "needsCount": needsCount,
                "notFrom": notFromList,
                "selectFrom": selectFromList
            })

        parsedRequirements.append(requirement_obj)

    return parsedRequirements