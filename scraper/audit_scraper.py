from bs4 import BeautifulSoup

file_path = r"My Audit.html"

# 1. Load your HTML file
with open(file_path, "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

# 2. Find all requirements
requirements = soup.find_all("div", class_="requirement")

# 3. Write extracted data to a text file
with open("degree_extracted.txt", "w", encoding="utf-8") as out:
    i = 0

    for req in requirements:
        # Don't look at unecessary items
        if i < 8:
            i += 1
            continue

        # --- Requirement title and status ---
        title_tag = req.find("div", class_="reqTitle")
        status_tag = req.find("div", class_="status")

        title = title_tag.get_text(strip=True)
        status = status_tag.get_text(strip=True)

        # If the requirement is not met, get information about it
        if "Unfulfilled" in status:

            out.write(f"Requirement: {title}")

            # --- Subrequirements ---
            subreqs = req.find_all("div", class_="subrequirement")
            for sub in subreqs:
                # sub_title_tag = sub.find("span", class_="subreqTitle")
                # sub_status_tag = sub.find("span", class_="status")
                # sub_title = sub_title_tag.get_text(strip=True) if sub_title_tag else "(No Subreq Title)"
                # sub_status = sub_status_tag.get_text(strip=True) if sub_status_tag else "(No Status)"
                # out.write(f"    Subrequirement: {sub_title}\n")
                # out.write(f"    Status: {sub_status}\n")

                # Title of subreq
                subTitle = sub.select_one(".subreqTitle")
                if subTitle:
                    subTitleText = subTitle.get_text(strip=True)
                    out.write(f"\n  {subTitleText}\n")

                # Completed courses inside the not fully completed requirement
                completedCourses = sub.select(".completedCourses tr.takenCourse")
                for course in completedCourses:
                    course_text = " ".join(course.stripped_strings)
                    out.write(f"\n    {course_text}\n")

                # Needs this number of courses to meet the requirement
                needsCount = sub.select_one(".subreqNeeds .count")
                if needsCount:
                    needsCountText = needsCount.get_text(strip=True)
                    out.write(f"\n  Needs: {needsCountText}\n")

                # Don't select from these courses
                notCourses = sub.select(".notcourses .course")
                out.write("\n")
                out.write("    Not From: ")
                for course in notCourses:
                    course_text = " ".join(course.stripped_strings)
                    out.write(f"{course_text}, ")
                out.write("\n")

                # Select from these courses
                selectFromCourses = sub.select(".selectcourses .course")
                out.write("\n")
                out.write("    Select From: ")
                for course in selectFromCourses:
                    course_text = " ".join(course.stripped_strings)
                    out.write(f"{course_text}, ")
                out.write("\n")

            out.write("\n" + "-" * 60 + "\n\n")

print("✅ Extraction complete! Check 'degree_audit_extracted.txt'")
