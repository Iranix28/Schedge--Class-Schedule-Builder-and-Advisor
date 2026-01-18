import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time
import re
import json
import pdb
from pathlib import Path
from app.database.query_routers.departments_query import *
from app.database.query_routers.courses_query import *
from app.database.query_routers.course_prerequisites_query import *
from app.database.query_routers.class_sections_query import *
from app.database.session import SessionLocal
from datetime import datetime

# create the CS department
db = SessionLocal()
# cs_dept = DepartmentCreate(name="Mathematis", subject="MATH")
# cs_department = create_department(db, cs_dept)

seen_course_codes = set()
seen_departments = set()
seen_departments.add("MATH")

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

VALID_SUBJECTS = {
    "ACCTG","AEROS","ANAT","ANES","ANTH","ARAB","ARCH","ART","ARTH","ARTX",
    "ASL","ASTP","ASTR","ATHL","ATMOS","ATSM","BIO C","BIOL","BME","BMI","BUS",
    "CHEM","CH EN","CERM","CHIN","CMP","COMM","CRIM","CS","CSD","CTLE","CVEEN",
    "DS","ECON","ECE","EAS","ECS","ED PS","EDU","EHUM","ELP","ENGL","ENTP",
    "ENV","ENVST","ETHNC","ESSFC","FCS","FILM","FINAN","FP MD","GAMES","GEOG",
    "GERON","GNDR","H EDU","H EDUC","H GEN","HSP","HONOR","IS","INTMD","IAGE",
    "JAPAN","KINES","LAWC","MATH","ME EN","MGT","MKTG","MSE","MD LB","MIL S",
    "NURS","NUIP","OSC","PHYS","PRT","PRTS","PSY","PUBPL","RECTH","SCLPT",
    "STRAT","THEA","WRTG"
}

# Normalize subjects for matching
NORMALIZED_SUBJECTS = {
    subj.replace(" ", ""): subj for subj in VALID_SUBJECTS
}

# Longest first so "MEEN" beats "ME"
SORTED_SUBJECT_KEYS = sorted(
    NORMALIZED_SUBJECTS.keys(),
    key=len,
    reverse=True
)

COURSE_REGEX = re.compile(
    rf"\b({'|'.join(map(re.escape, SORTED_SUBJECT_KEYS))})\s*(\d{{3,4}})\b"
)

TOKEN_REGEX = re.compile(
    rf"\b(?P<op>AND|OR)\b|(?P<subject>{'|'.join(map(re.escape, SORTED_SUBJECT_KEYS))})\s*(?P<number>\d{{3,4}})",
    re.I
)


def parse_requirements(raw_pre, raw_co):

    def parse_line(text):
        if not text or text.strip() in ("N/A", ""):
            return []

        clean = (
            text.upper()
            .replace("(", " ")
            .replace(")", " ")
            .replace(".", "")
        )

        groups = []
        current_or_group = []
        pending_op = None

        for m in TOKEN_REGEX.finditer(clean):
            if m.group("op"):
                pending_op = m.group("op").upper()
                continue

            subj_key = m.group("subject")
            num = m.group("number")
            subject = NORMALIZED_SUBJECTS[subj_key]
            course = subject.replace(" ", "") + num

            if pending_op == "OR":
                current_or_group.append(course)
            else:
                # flush any previous OR group
                if current_or_group:
                    groups.append(current_or_group)
                    current_or_group = []

                groups.append(course)

            pending_op = None

        # flush trailing OR group
        if current_or_group:
            groups.append(current_or_group)

        return groups

    prereq_list = parse_line(raw_pre)
    coreq_list = parse_line(raw_co)

    return prereq_list, coreq_list





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



# --- assume your existing extract_label_value(soup, label_pattern) is present --- #
# It should return the string following the label or "N/A".

def get_enrollment_blob(soup):
    """
    Use the existing extractor to pull the Enrollment text blob.
    Fallbacks to trying to pull any <p> that contains prerequisite/corequisite words.
    Returns a normalized string or "N/A".
    """
    # Prefer the explicit Enrollment label via your extractor
    blob = extract_label_value(soup, r"Enrollment\s+Information[:\s]*")
    if blob and blob != "N/A":
        return re.sub(r"\s+", " ", blob).strip()

    # Fallback: try to find a <p> that contains the target words and return its text
    p = soup.find("p", string=re.compile(r"(Prerequisite|Corequisite|Enrollment)", re.I))
    if p:
        return re.sub(r"\s+", " ", p.get_text(" ", strip=True)).strip()

    # Final fallback: search anywhere on page for those words and return surrounding text
    any_str = soup.find(string=re.compile(r"(Prerequisite|Corequisite|Enrollment)", re.I))
    if any_str:
        return re.sub(r"\s+", " ", any_str.strip()).strip()

    return "N/A"


def split_prereq_core_from_enrollment_blob(blob):
    """
    Given a text blob (string) containing Enrollment / Prerequisites / Corequisites,
    return (prereq_raw, coreq_raw).
    Rules:
      - prereq_raw is the text after the Prerequisites: label up to the next '*requisites:' label.
      - coreq_raw is the text after the Corequisites: label to end.
      - If no labels, treat entire blob as prereq_raw.
      - Tolerant: matches 'Corerequisites', 'Corequisites', etc. by looking for words containing 'requisite'.
    """
    prereq_raw = "N/A"
    coreq_raw = "N/A"

    if not blob or blob == "N/A":
        return prereq_raw, coreq_raw

    text = re.sub(r"\s+", " ", blob).strip()

    # Find all labels of forms: "<something>requisites:" or "enrollment requirements:"
    label_iter = list(re.finditer(r"(?i)\b(\w*requisite\w*|enrollment\s+requirements?)\s*:", text))
    if not label_iter:
        # no explicit labels: everything is prereqs
        return text, coreq_raw

    # Build slices: each slice is (label_text, content_after_label_up_to_next_label)
    slices = []
    for i, m in enumerate(label_iter):
        label = m.group(1)
        start = m.end()
        end = label_iter[i + 1].start() if i + 1 < len(label_iter) else len(text)
        content = text[start:end].strip()
        slices.append((label, content))

    found_pre = False
    found_co = False

    for label, content in slices:
        low = label.lower()
        if "pre" in low or "prerequisite" in low:
            found_pre = True
            prereq_raw = content or "N/A"
        elif "core" in low or "corerequisite" in low:
            found_co = True
            coreq_raw = content or "N/A"
        elif "enrollment" in low:
            # If there's no explicit prereq slice already, treat enrollment as prereqs.
            if not found_pre:
                found_pre = True
                prereq_raw = content or "N/A"
            # otherwise ignore or keep separate (we chose to ignore extra enrollment if prereqs present)

    # If we found only one label and it was a 'requisite' that is ambiguous, try to guess:
    # e.g. single "*requisites:" that contains both "Prerequisites: ... Corequisites: ..." (rare),
    # but above we already split by label occurrences so we should be safe.
    return prereq_raw, coreq_raw


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
    # if course_code != "MATH 6960": # debug a specific course
    #     continue
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
            elif "-" in units:
                units = units.replace(" - ", " ").split(" ")[0] # if there is a unit range
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
            # prereqs_raw = extract_label_value(d_soup, r"Pre[\s-]*requisites?[:\s]*")
            # coreqs_raw = extract_label_value(d_soup, r"Co[\s-]*requisites?[:\s]*")

            enrollment_blob = get_enrollment_blob(d_soup)                 
            prereqs_raw, coreqs_raw = split_prereq_core_from_enrollment_blob(enrollment_blob)

            # parse structured prereq list (this isnt quiet working yet)
            prereq_list, coreq_list = parse_requirements(prereqs_raw, coreqs_raw)

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
        "prerequisites": prereq_list,
        "corequisites": coreq_list,
        "description": full_desc
    })



    # add this course to the database

    # if course_code not in seen_course_codes:
    #     new_course = CourseCreate(
    #         department_id=1,  # link to CS department
    #         number=course_code.split()[1],
    #         name=title,
    #         units=units,
    #         description=full_desc
    #     )

    #     cs_course = create_course(db, new_course)

    #     seen_course_codes.add(course_code)

    
    # if schedule != "N/A":

    #     new_class = ClassSectionCreateByCourseCode(
    #         department_subject=course_code.split()[0],  
    #         course_number=course_code.split()[1],         
    #         term_season="Spring",         
    #         term_year="2026",           
    #         section_code=section,        
    #         # location: Optional[str] = None
    #         days=schedule.split()[0],
    #         start_time=datetime.strptime(schedule.split()[1].split("-")[0], "%I:%M%p").time(),
    #         end_time=datetime.strptime(schedule.split()[1].split("-")[1], "%I:%M%p").time(),
    #         professor_name=instructor
    #     )
    
    # else:
    #     new_class = ClassSectionCreateByCourseCode(
    #     department_subject=course_code.split()[0],  
    #     course_number=course_code.split()[1],         
    #     term_season="Spring",         
    #     term_year="2026",           
    #     section_code=section,        
    #     # location: Optional[str] = None
    #     days=schedule.split()[0],
    #     professor_name=instructor
    #     )


    # cs_class = create_class_section_by_course_code(db, new_class)

    # add prereq classes
    # for requisite in prereq_list:
    #     if "pre" in requisite.split(): 
    #         match = re.search(r"([A-Z]{2,4})(\d{3,4})", requisite)
    #         if match:
    #             subject = match.group(1)
    #             number = match.group(2)

    #         if subject not in seen_departments:
    #             dept = DepartmentCreate(name=subject, subject=subject)
    #             department = create_department(db, dept)

    #         new_prereq = CoursePrerequisiteCreateByCode(
    #             department_subject=course_code.split()[0],
    #             course_number=course_code.split()[1],  
    #             prerequisite_department_subject=subject,  
    #             prerequisite_course_number=number,
    #         )

    #         cs_requisite = create_course_prerequisite_by_codes(db, new_prereq)


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
        f.write(f"Prerequisite list: {c['prerequisites']}\n")
        f.write(f"Corequisite list: {c['corequisites']}\n")
        f.write("-" * 70 + "\n")

print(f"\nSaved detailed info for {len(courses)} courses to {OUTPUT_FILE.resolve()}")

