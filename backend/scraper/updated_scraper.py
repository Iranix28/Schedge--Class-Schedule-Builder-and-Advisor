import os
import re
import json
import requests
from bs4 import BeautifulSoup
from bs4.element import Tag

BASE = "https://class-schedule.app.utah.edu/main/1264/"
LIST_URL = BASE + "class_list.html?subject=CS"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# ==================================================
# PREREQUISITE PARSER
# Storage semantics:
# - top-level list => AND
# - sublist => OR
# NOTE: This groups adjacent OR sequences; it does not fully model parentheses/NOT.
# ==================================================

def parse_prerequisites(text: str):
    if not text:
        return []

    text = re.sub(r"\s+", " ", text)

    text = re.sub(
        r"Full Major Status[^.]*|permission of instructor[^.]*|Major or Minor[^.]*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    course_pat = r"\b(?!AND\b|OR\b)([A-Z]{2,6})\s*(\d{4})\b"
    matches = [(m.group(1) + m.group(2), m.start(), m.end())
               for m in re.finditer(course_pat, text)]

    result = []
    i = 0
    while i < len(matches):
        course, _, end = matches[i]

        if i + 1 < len(matches):
            next_start = matches[i + 1][1]
            between = text[end:next_start].lower()

            if " or " in between and " and " not in between:
                group = [course]
                i += 1
                while i < len(matches):
                    group.append(matches[i][0])
                    if i + 1 < len(matches):
                        between2 = text[matches[i][2]:matches[i + 1][1]].lower()
                        if " or " not in between2 or " and " in between2:
                            break
                    i += 1
                result.append(group)
            else:
                result.append(course)
        else:
            result.append(course)

        i += 1

    return result

# ==================================================
# DETAILS PAGE: description + prereqs
# ==================================================

def scrape_details(subj: str, catno: str, section: str):
    url = f"{BASE}description.html?subj={subj}&catno={catno}&section={section}"
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    lines = [ln.strip() for ln in soup.get_text("\n").splitlines()]
    lines = [ln for ln in lines if ln]

    cleaned = []
    for ln in lines:
        if "© The University of Utah" in ln:
            break
        cleaned.append(ln)
    lines = cleaned

    prereq_text = ""
    description = ""

    for ln in lines:
        if "Prerequisites:" in ln:
            prereq_text = ln.split("Prerequisites:", 1)[1].strip()
            break

    for i, ln in enumerate(lines):
        if ln == "Description":
            desc_parts = []
            for j in range(i + 1, len(lines)):
                nxt = lines[j]
                if nxt in {"Course Detail", "Units:", "Course Components:", "Enrollment Information", "Enrollment Requirement:"}:
                    break
                if "Prerequisites:" in nxt:
                    break
                desc_parts.append(nxt)
            description = " ".join(desc_parts).strip()
            break

    return description, parse_prerequisites(prereq_text)

# ==================================================
# BASE PAGE: schedule + location from TABLE
# Your XPath indicates tbody/tr/th[1] = schedule, th[2] = location.
# We find the second duplicated <h3> for the section, then take the FIRST table after it.
# ==================================================

MEETING_CELL_RE = re.compile(
    r"\b[A-Za-z]{1,7}\s*/\s*\d{1,2}:\d{2}(?:AM|PM)\s*-\s*\d{1,2}:\d{2}(?:AM|PM)\b"
)

def _uniq(seq):
    seen = set()
    out = []
    for x in seq:
        x = (x or "").strip()
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out

def find_second_h3(soup: BeautifulSoup, subj: str, catno: str, section: str):
    pat = re.compile(rf"\b{subj}\s*{catno}\s*-\s*{section}\b")
    hits = [h3 for h3 in soup.find_all("h3") if pat.search(h3.get_text(" ", strip=True))]
    return hits[1] if len(hits) >= 2 else None

def extract_schedule_and_location_from_base(soup: BeautifulSoup, subj: str, catno: str, section: str):
    anchor = find_second_h3(soup, subj, catno, section)
    if not anchor:
        return "", ""

    # Find the first table after this anchor, but stop if we hit the next h3
    table = None
    for el in anchor.next_elements:
        if isinstance(el, Tag) and el.name == "h3":
            break
        if isinstance(el, Tag) and el.name == "table":
            table = el
            break

    if not table:
        return "", ""

    schedules = []
    locations = []

    # Your XPath says tbody/tr/th[1] and th[2]
    for tr in table.find_all("tr"):
        ths = tr.find_all("th")
        if len(ths) >= 2:
            sched = ths[0].get_text(" ", strip=True)
            loc = ths[1].get_text(" ", strip=True)

            # Only accept rows that look like real meeting rows
            if MEETING_CELL_RE.search(sched):
                # Normalize "MoWe / 03:00PM-04:20PM" -> "MoWe/03:00PM-04:20PM"
                sched = re.sub(r"\s*/\s*", "/", sched)
                sched = re.sub(r"\s*-\s*", "-", sched)
                schedules.append(sched)

                # Location might be empty for arranged/TBA
                if loc:
                    locations.append(loc)

    return ", ".join(_uniq(schedules)), ", ".join(_uniq(locations))

# ==================================================
# MAIN SCRAPER
# ==================================================

def scrape():
    resp = requests.get(LIST_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    sections = []
    seen = set()

    for h3 in soup.find_all("h3"):
        header_text = h3.get_text(" ", strip=True)
        m = re.match(r"([A-Z]+)\s*(\d+)\s*-\s*(\d+)\s*(.+)", header_text)
        if not m:
            continue

        subj, catno, sec, name = m.groups()
        course_id = subj + catno
        key = (course_id, sec)

        # dedupe duplicated header blocks
        if key in seen:
            continue
        seen.add(key)

        instructor = component = units = seats = ""

        ul = h3.find_next("ul")
        if ul:
            for li in ul.find_all("li"):
                t = li.get_text(strip=True)
                if t.startswith("Instructor:"):
                    instructor = t.split(":", 1)[1].strip()
                elif t.startswith("Component:"):
                    component = t.split(":", 1)[1].strip()
                elif t.startswith("Units:"):
                    units = t.split(":", 1)[1].strip()
                elif t.startswith("Seats Available:"):
                    seats = t.split(":", 1)[1].strip()

        schedule, location = extract_schedule_and_location_from_base(soup, subj, catno, sec)
        description, prereqs = scrape_details(subj, catno, sec)

        sections.append({
            "course_id": course_id,
            "course_name": name,
            "section": sec,
            "units": units,
            "instructor": instructor,
            "component": component,
            "available_seats": seats,
            "schedule": schedule,
            "location": location,
            "description": description,
            "prerequisites": prereqs,
        })

    return sections

# ==================================================
# WRITE OUTPUT NEXT TO SCRIPT
# ==================================================

def main():
    data = scrape()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, "courses.txt")

    with open(out_path, "w", encoding="utf-8") as f:
        for c in data:
            for k, v in c.items():
                f.write(f"{k}: {json.dumps(v) if isinstance(v, list) else v}\n")
            f.write("-" * 80 + "\n\n")

    print(f"Wrote {len(data)} sections to {out_path}")

if __name__ == "__main__":
    main()
