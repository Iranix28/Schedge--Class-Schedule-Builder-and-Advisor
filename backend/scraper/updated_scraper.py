import requests
import re
import json
import os
from bs4 import BeautifulSoup

BASE = "https://class-schedule.app.utah.edu/main/1264/"
LIST_URL = BASE + "class_list.html?subject=CS"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

# ==================================================
# PREREQUISITE PARSER
# STRUCTURE:
# - top-level list = AND
# - sublist = OR
# ==================================================

def parse_prerequisites(text):
    if not text:
        return []

    text = re.sub(r"\s+", " ", text)

    # remove non-course requirements
    text = re.sub(
        r"Full Major Status[^.]*|permission of instructor[^.]*|Major or Minor[^.]*",
        "",
        text,
        flags=re.IGNORECASE
    )

    course_pat = r"\b(?!AND\b|OR\b)([A-Z]{2,4})\s*(\d{4})\b"
    matches = [(m.group(1) + m.group(2), m.start(), m.end())
               for m in re.finditer(course_pat, text)]

    result = []
    i = 0
    while i < len(matches):
        course, start, end = matches[i]

        if i + 1 < len(matches):
            between = text[end:matches[i + 1][1]].lower()

            # OR group
            if " or " in between and " and " not in between:
                group = [course]
                i += 1
                while i < len(matches):
                    group.append(matches[i][0])
                    if i + 1 < len(matches):
                        between = text[matches[i][2]:matches[i + 1][1]].lower()
                        if " or " not in between or " and " in between:
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
# DESCRIPTION + PREREQS PAGE
# ==================================================

def scrape_details(subj, catno, section):
    url = f"{BASE}description.html?subj={subj}&catno={catno}&section={section}"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    soup = BeautifulSoup(resp.text, "html.parser")

    description = ""
    prereqs = []

    content = soup.find("div", id="content")
    if not content:
        return description, prereqs

    desc_div = content.find("div", class_="course-description")
    if desc_div:
        description = desc_div.get_text(strip=True)

    prereq_div = content.find("div", class_="course-prerequisites")
    if prereq_div:
        prereqs = parse_prerequisites(prereq_div.get_text(strip=True))

    return description, prereqs

# ==================================================
# SCHEDULE EXTRACTOR (BASE PAGE)
# ==================================================

def extract_schedule(soup, header_text):
    headers = soup.find_all("h3", string=header_text)
    if len(headers) < 2:
        return ""

    table = headers[1].find_next("table")
    if not table:
        return ""

    times = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if cells:
            txt = cells[0].get_text(strip=True)
            if "/" in txt:
                times.append(txt)

    return ", ".join(times)

# ==================================================
# MAIN SCRAPER
# ==================================================

def scrape():
    resp = requests.get(LIST_URL, headers=HEADERS, timeout=15)
    soup = BeautifulSoup(resp.text, "html.parser")

    sections = []
    seen = set()

    for h3 in soup.find_all("h3"):
        header_text = h3.get_text(strip=True)

        m = re.match(
            r"([A-Z]+)\s*(\d+)\s*-\s*(\d+)\s*(.+)",
            header_text
        )
        if not m:
            continue

        subj, catno, section, name = m.groups()
        course_id = subj + catno
        key = (course_id, section)

        if key in seen:
            continue
        seen.add(key)

        instructor = component = units = seats = ""

        ul = h3.find_next("ul")
        if ul:
            for li in ul.find_all("li"):
                t = li.get_text(strip=True)
                if t.startswith("Instructor:"):
                    instructor = t.replace("Instructor:", "").strip()
                elif t.startswith("Component:"):
                    component = t.replace("Component:", "").strip()
                elif t.startswith("Units:"):
                    units = t.replace("Units:", "").strip()
                elif t.startswith("Seats Available:"):
                    seats = t.replace("Seats Available:", "").strip()

        schedule = extract_schedule(soup, header_text)
        description, prereqs = scrape_details(subj, catno, section)

        sections.append({
            "course_id": course_id,
            "course_name": name,
            "section": section,
            "units": units,
            "instructor": instructor,
            "component": component,
            "available_seats": seats,
            "schedule": schedule,
            "description": description,
            "prerequisites": prereqs
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
