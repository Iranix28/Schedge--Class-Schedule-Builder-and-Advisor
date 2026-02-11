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
    """
    Output structure:
      - top-level list => AND
      - sublist => OR
      - sub-sublist => AND (inside an OR option)

    Key behaviors:
      - Handles parentheses properly (AND has higher precedence than OR).
      - Handles bare numbers like "1220" by inheriting the last seen dept (e.g., MATH 1210 AND 1220).
      - Ignores non-course options (AP scores, Higher Math, etc.) WITHOUT breaking boolean structure by
        dropping dangling AND/OR operators at the TOKEN level (only keep AND/OR between valid operands).
    """
    if not text:
        return []

    s = re.sub(r"\s+", " ", text).strip()
    s = re.sub(r"^\s*Prerequisites:\s*", "", s, flags=re.IGNORECASE)

    # Remove grade phrases so "'C-' or better in ..." doesn't introduce a fake boolean OR
    s = re.sub(
        r"(?i)\b['\"]?[A-F](?:[+\-\u2010\u2011\u2012\u2013\u2014\u2212])?['\"]?\s*or\s*better\s*in\b",
        " ",
        s,
    )
    s = re.sub(r"(?i)\bor\s+better\b", " better", s)

    # Remove common non-course constraints
    s = re.sub(r"(?i)\bFoundational Courses complete\b", " ", s)

    # Remove parenthetical constraints that don't contain course codes (e.g. (Major OR Minor ...))
    def _strip_non_course_parens(match):
        chunk = match.group(0)
        return chunk if re.search(r"\b[A-Z]{2,6}\s*\d{4}\b", chunk) else " "

    s = re.sub(r"\([^()]*\)", _strip_non_course_parens, s)
    s = re.sub(r"\s+", " ", s).strip()

    # Treat ampersand as AND (some prereqs use "&" instead of "AND")
    s = re.sub(r"\s*&\s*", " AND ", s)


    # Raw tokenize (we will filter operators after)
    token_re = re.compile(
        r"(\()|(\))|\b(AND|OR)\b|\b([A-Z]{2,6})\s*(\d{4})\b|\b(\d{4})\b",
        re.IGNORECASE
    )

    raw = []
    last_dept = None

    for m in token_re.finditer(s):
        if m.group(1):
            raw.append(("LP", "("))
        elif m.group(2):
            raw.append(("RP", ")"))
        elif m.group(3):
            op = m.group(3).upper()
            raw.append((op, op))
        elif m.group(4) and m.group(5):
            dept = m.group(4).upper()
            num = m.group(5)
            last_dept = dept
            raw.append(("COURSE", f"{dept}{num}"))
        elif m.group(6):
            # bare number, inherit last dept
            num = m.group(6)
            if last_dept:
                raw.append(("COURSE", f"{last_dept}{num}"))
            # else ignore

    if not raw:
        return []

    # Filter AND/OR: keep only if it sits between valid operands
    # operand on left: COURSE or RP
    # operand on right: COURSE or LP
    def is_left_operand(tok_type):   # before operator
        return tok_type in ("COURSE", "RP")

    def is_right_operand(tok_type):  # after operator
        return tok_type in ("COURSE", "LP")

    tokens = []
    for idx, (tt, tv) in enumerate(raw):
        if tt in ("AND", "OR"):
            prev_type = raw[idx - 1][0] if idx - 1 >= 0 else None
            next_type = raw[idx + 1][0] if idx + 1 < len(raw) else None
            if prev_type and next_type and is_left_operand(prev_type) and is_right_operand(next_type):
                tokens.append((tt, tv))
            # else drop dangling operator
        else:
            tokens.append((tt, tv))

    if not tokens:
        return []

    # --- Recursive descent parser (AND precedence > OR) ---
    i = 0

    def peek():
        return tokens[i] if i < len(tokens) else ("EOF", "")

    def consume(expected=None):
        nonlocal i
        tok = peek()
        if expected and tok[0] != expected:
            return None
        i += 1
        return tok

    def parse_factor():
        tok = peek()
        if tok[0] == "COURSE":
            consume("COURSE")
            return ("COURSE", tok[1])
        if tok[0] == "LP":
            consume("LP")
            node = parse_or()
            consume("RP")  # tolerate mismatched RP
            return node
        consume()
        return None

    def parse_and():
        left = parse_factor()
        terms = [left] if left else []
        while peek()[0] == "AND":
            consume("AND")
            right = parse_factor()
            if right:
                terms.append(right)
        if not terms:
            return None
        if len(terms) == 1:
            return terms[0]
        return ("AND", terms)

    def parse_or():
        left = parse_and()
        terms = [left] if left else []
        while peek()[0] == "OR":
            consume("OR")
            right = parse_and()
            if right:
                terms.append(right)
        if not terms:
            return None
        if len(terms) == 1:
            return terms[0]
        return ("OR", terms)

    ast = parse_or()
    if not ast:
        return []

    # Normalize: drop None, flatten same ops
    def norm(node):
        if not node:
            return None
        t = node[0]
        if t == "COURSE":
            return node
        if t in ("AND", "OR"):
            children = []
            for c in node[1]:
                nc = norm(c)
                if not nc:
                    continue
                if nc[0] == t:
                    children.extend(nc[1])
                else:
                    children.append(nc)
            if not children:
                return None
            if len(children) == 1:
                return children[0]
            return (t, children)
        return None

    ast = norm(ast)
    if not ast:
        return []

    # Convert to your storage format
    def to_store(node):
        if node[0] == "COURSE":
            return node[1]
        if node[0] == "AND":
            out = []
            for c in node[1]:
                v = to_store(c)
                if v is not None:
                    out.append(v)
            return out
        if node[0] == "OR":
            out = []
            for c in node[1]:
                v = to_store(c)
                if v is not None:
                    out.append(v)
            return out
        return None

    stored = to_store(ast)

    # Enforce top-level AND list
    if isinstance(stored, str):
        return [stored]
    if isinstance(stored, list):
        return stored if ast[0] == "AND" else [stored]
    return []


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
