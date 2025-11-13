from bs4 import BeautifulSoup

file_path = r"C:\Users\u1461781\Desktop\My Audit.html"

# 1. Load your HTML file
with open(file_path, "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

# 2. Find all requirements
requirements = soup.find_all("div", class_="requirement")

# 3. Write extracted data to a text file
with open("scraper/degree_audit_extracted.txt", "w", encoding="utf-8") as out:
    for req in requirements:
        # --- Requirement title and status ---
        title_tag = req.find("div", class_="reqTitle")
        status_tag = req.find("div", class_="status")
        title = title_tag.get_text(strip=True) if title_tag else "(No Title)"
        status = status_tag.get_text(strip=True) if status_tag else "(No Status)"
        out.write(f"Requirement: {title}\nStatus: {status}\n")

        # --- GPA and hours (requirementTotals) ---
        totals = req.find("table", class_="requirementTotals")
        if totals:
            for row in totals.find_all("tr"):
                label = row.find("td", class_="rowlabel")
                gpa = row.find("td", class_="gpa")
                numbers = [n.get_text(strip=True) for n in row.find_all("td", class_="number")]
                if label:
                    out.write(f"    {label.get_text(strip=True)} ")
                if numbers:
                    out.write(" ".join(numbers) + " ")
                if gpa:
                    out.write(f"GPA: {gpa.get_text(strip=True)}")
                out.write("\n")

        # --- Subrequirements ---
        subreqs = req.find_all("div", class_="subrequirement")
        for sub in subreqs:
            sub_title_tag = sub.find("span", class_="subreqTitle")
            sub_status_tag = sub.find("span", class_="status")
            sub_title = sub_title_tag.get_text(strip=True) if sub_title_tag else "(No Subreq Title)"
            sub_status = sub_status_tag.get_text(strip=True) if sub_status_tag else "(No Status)"
            out.write(f"    Subrequirement: {sub_title}\n")
            out.write(f"    Status: {sub_status}\n")

            # Subrequirement totals (like GPA or credit info)
            sub_totals = sub.find("div", class_="subrequirementTotals")
            if sub_totals:
                for row in sub_totals.find_all("tr"):
                    label = row.find("td", class_="rowlabel")
                    gpa = row.find("td", class_="gpa")
                    numbers = [n.get_text(strip=True) for n in row.find_all("td", class_="number")]
                    if label:
                        out.write(f"        {label.get_text(strip=True)} ")
                    if numbers:
                        out.write(" ".join(numbers) + " ")
                    if gpa:
                        out.write(f"GPA: {gpa.get_text(strip=True)}")
                    out.write("\n")

            # Courses inside subrequirements
            courses = sub.select(".completedCourses tr.takenCourse")
            for course in courses:
                course_text = " ".join(course.stripped_strings)
                out.write(f"        {course_text}\n")

        out.write("\n" + "-" * 60 + "\n\n")

print("✅ Extraction complete! Check 'degree_audit_extracted.txt'")
