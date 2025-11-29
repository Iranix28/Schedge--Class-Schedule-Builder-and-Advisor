import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time
import re
from pathlib import Path
from app.database.query_routers.departments_query import *
from app.database.query_routers.courses_query import *
from app.database.query_routers.course_prerequisites_query import *
from app.database.query_routers.class_sections_query import *
from app.database.session import SessionLocal

# create the CS department
db = SessionLocal()
# cs_dept = DepartmentCreate(name="Computer Science", subject="CS")
# cs_department = create_department(db, cs_dept)

# === CONFIG ===
BASE_URL = "https://class-schedule.app.utah.edu/main/1264/"
LOCAL_HTML = Path("course_page.html")
OUTPUT_FILE = Path("cs_courses_detailed.txt")


SUBJECT_PATTERN = re.compile(r"^[A-Z]{2,4}$")
NUMBER_PATTERN = re.compile(r"^\d{3,4}$")
FULL_COURSE_PATTERN = re.compile(r"^([A-Z]{2,4})(\d{3,4})$")

# FIXED: capture C- correctly
GRADE_PATTERN = re.compile(
    r"(?<![A-Z0-9])"
    r"(A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|E)"
    r"(?![A-Z0-9])",
    re.IGNORECASE
)

FORBIDDEN_SUBJECTS = {"AP", "SCORE", "OF", "HIGHER", "CALC", "AB", "BC"}


def parse_requirements_to_list(raw_pre, raw_co):

    def parse_line(text, kind):
        if not text or text.strip() in ("N/A", ""):
            return []

        text = text.replace("(", " ").replace(")", " ")
        tokens = text.replace(",", " ").replace(";", " ").split()

        results = []
        last_subject = None
        pending_op = None  # "and", "or", or None

        # FIX: extract full grade including hyphens
        m = GRADE_PATTERN.search(text)
        last_grade = m.group(1).upper() if m else None

        for token in tokens:
            up = token.upper()

            if up == "OR":
                pending_op = "or"
                continue
            if up == "AND":
                pending_op = "and"
                continue

            if up in FORBIDDEN_SUBJECTS:
                continue

            m_full = FULL_COURSE_PATTERN.match(up)
            if m_full:
                subj, num = m_full.groups()
                last_subject = subj
                course = subj + num
            elif SUBJECT_PATTERN.match(up) and not NUMBER_PATTERN.match(up):
                last_subject = up
                continue
            elif NUMBER_PATTERN.match(up):
                if not last_subject:
                    continue
                course = last_subject + up
            else:
                continue

            prefix = f"{pending_op} " if pending_op else ""
            pending_op = None

            grade = f"{last_grade} " if last_grade else ""

            results.append(f"{prefix}{kind} {grade}{course}")

        return results

    final = []
    final.extend(parse_line(raw_pre, "pre"))
    final.extend(parse_line(raw_co, "co"))
    return final




# regex to extract course codes from the preq/coreq description
def extract_course_codes(prereq_string):
    if prereq_string in (None, "N/A"):
        return []

    # Regex: DEPT + space + number   (CS 3500, MATH 1210, ECE 2280, etc.)
    pattern = r"\b([A-Z]{2,4})\s*([0-9]{3,4})\b"

    matches = re.findall(pattern, prereq_string)

    # Recombine them cleanly: [('CS', '3500')] - ["CS 3500"]
    return [f"{dept} {num}" for dept, num in matches]

def extract_label_value(soup, label_pattern):
    """Finds label-value pairs on the Class Details page robustly."""
    for txt in soup.find_all(string=re.compile(label_pattern, re.I)):
        if ":" in txt:
            val = txt.split(":", 1)[-1].strip()
            if val:
                return val
        parent = txt.parent
        if parent:
            # Check next sibling
            sib = parent.find_next_sibling()
            if sib and sib.get_text(strip=True):
                return sib.get_text(" ", strip=True)
            # Check text inside same element
            full = parent.get_text(" ", strip=True)
            parts = re.split(label_pattern + r"\s*:", full, flags=re.I)
            if len(parts) > 1:
                return parts[1].strip()
    return "N/A"

# load course list
if not LOCAL_HTML.exists():
    raise FileNotFoundError("'course_page.html' not found. Download it first.")

soup = BeautifulSoup(LOCAL_HTML.read_text(encoding="utf-8"), "lxml")
course_cards = soup.find_all("div", class_="class-info")
print(f"Found {len(course_cards)} courses")

courses = []


for idx, card in enumerate(course_cards, start=1):
    header = card.find("h3")
    if not header:
        continue

    code_tag = header.find("a")
    course_code = code_tag.get_text(strip=True) if code_tag else ""
    spans = header.find_all("span")
    section = spans[0].get_text(strip=True) if len(spans) > 0 else ""
    title = spans[1].get_text(strip=True) if len(spans) > 1 else ""

    # instructor
    instructor = "N/A"
    for li in card.find_all("li"):
        text = li.get_text(" ", strip=True)
        if "Instructor" in text:
            a = li.find("a")
            instructor = a.get_text(" ", strip=True) if a else text.split("Instructor:", 1)[-1].strip()
            break

    # schedule
    time_table = card.find("table", class_="time-table")
    if time_table:
        days = [s.get_text(" ", strip=True) for s in time_table.select("span[data-day]")]
        times = [s.get_text(" ", strip=True) for s in time_table.select("span[data-time]")]
        if days and times:
            schedule = " / ".join(f"{d} {t}" for d, t in zip(days, times))
        else:
            schedule = " / ".join(days + times)
    else:
        schedule = "N/A"

    # units + lecture/laboratory
    units = "N/A"
    components = "N/A"
    for li in card.find_all("li"):
        text = li.get_text(" ", strip=True)
        if "Units:" in text:
            units = text.split(":", 1)[-1].strip()
            if units == "--":
                units = 0
        elif "Component:" in text:
            components = text.split(":", 1)[-1].strip()

    # prereq and details
    details_link = card.find("a", string=lambda s: s and "Class Details" in s)
    prereqs_raw = "N/A"
    coreqs_raw = "N/A"
    full_desc = "N/A"
    prereq_list = []

    if details_link and details_link.get("href"):
        detail_url = urljoin(BASE_URL, details_link["href"])
        print(f"[{idx}] Fetching details for {course_code}")

        try:
            resp = requests.get(detail_url, timeout=10)
            resp.raise_for_status()
            d_soup = BeautifulSoup(resp.text, "lxml")

            # get pre + co separately
            prereqs_raw = extract_label_value(d_soup, r"Pre[\s-]*requisites?[:\s]*")
            coreqs_raw = extract_label_value(d_soup, r"Co[\s-]*requisites?[:\s]*")

            # parse structured prereq list (this isnt quiet working yet)
            prereq_list = parse_requirements_to_list(prereqs_raw, coreqs_raw)

            # description
            desc = extract_label_value(d_soup, r"Description")
            if desc != "N/A":
                full_desc = desc
            else:
                paras = [
                    p.get_text(" ", strip=True)
                    for p in d_soup.find_all("p")
                    if len(p.get_text(strip=True)) > 40
                ]
                if paras:
                    full_desc = " ".join(paras)

            time.sleep(0.1)

        except Exception as e:
            print(f"Error fetching {detail_url}: {e}")


    courses.append({
        "code": course_code,
        "section": section,
        "title": title,
        "instructor": instructor,
        "schedule": schedule,
        "units": units,
        "components": components,
        "prerequisites_raw": prereqs_raw,
        "corequisites_raw": coreqs_raw,
        "prereq_list": prereq_list,
        "description": full_desc
    })


    # add this course to the database
    # new_course = CourseCreate(
    #     department_id=1,  # link to CS department
    #     number=course_code,
    #     name=title,
    #     units=units,
    #     description=full_desc
    # )

    # cs_class = create_course(db, new_course)


db.close()

# save to file
with OUTPUT_FILE.open("w", encoding="utf-8") as f:
    for c in courses:
        f.write(f"{c['code']} - {c['title']} (Section {c['section']})\n")
        f.write(f"Instructor: {c['instructor']}\n")
        f.write(f"Schedule: {c['schedule']}\n")
        f.write(f"Units: {c['units']}\n")
        f.write(f"Components: {c['components']}\n")
        f.write(f"Description: {c['description']}\n")
        f.write(f"Prerequisites Raw: {c['prerequisites_raw']}\n")
        f.write(f"Corequisites Raw: {c['corequisites_raw']}\n")
        f.write(f"Prerequisite list: {c['prereq_list']}\n")
        f.write("-" * 70 + "\n")

print(f"\nSaved detailed info for {len(courses)} courses to {OUTPUT_FILE.resolve()}")

