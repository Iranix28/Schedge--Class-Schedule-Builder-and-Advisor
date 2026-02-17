import os
import re
import json
import requests
from bs4 import BeautifulSoup
from bs4.element import Tag

# ==================================================
# CONFIG
# ==================================================

TERM_CODE = os.environ.get("UOFU_TERM", "1264")
SUBJECT = os.environ.get("UOFU_SUBJECT", "CS")

BASE = f"https://class-schedule.app.utah.edu/main/{TERM_CODE}/"
LIST_URL = BASE + f"class_list.html?subject={SUBJECT}"
CATALOG_LIST_URL = "https://catalog.utah.edu/courses"

HEADERS = {"User-Agent": "Mozilla/5.0"}

# Dept codes from schedule index.html (supports spaced dept codes like "ME EN")
DEPT_CODES: list[str] = []

# ==================================================
# UTILS
# ==================================================

H3_RE = re.compile(r"^([A-Z]+)\s*(\d+)\s*-\s*(\d+)\s*(.+)$")

MEETING_CELL_RE = re.compile(
    r"([A-Za-z]{1,7}|TBA)\s*/\s*(\d{1,2}:\d{2}(?:AM|PM)|TBA)\s*-\s*(\d{1,2}:\d{2}(?:AM|PM)|TBA)",
    re.IGNORECASE,
)

FOOTER_MARKERS = (
    "© The University of Utah",
    "Nondiscrimination",
    "Accessibility",
    "Disclaimer",
    "Privacy",
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


def request_text(url: str, timeout: int = 25) -> str:
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.text


def normalize_section(sec: str) -> str:
    try:
        return f"{int(sec):03d}"
    except Exception:
        return (sec or "").strip()


# ==================================================
# DEPARTMENT CODES
# ==================================================


def fetch_department_codes() -> list[str]:
    """Pull subject codes from the schedule site's index.html for this term."""
    url = BASE + "index.html"
    html = request_text(url)
    soup = BeautifulSoup(html, "html.parser")

    codes = set()
    for a in soup.find_all("a"):
        t = a.get_text(" ", strip=True)
        m = re.match(r"^([A-Z]{1,4}(?:\s+[A-Z]{1,4})*)\s*-\s+", t)
        if m:
            codes.add(m.group(1).strip())

    if not codes:
        codes = {"CS", "MATH", "ECE", "WRTG", "HONOR", "ME EN", "CH EN", "ED PS", "PH TH"}

    return sorted(codes, key=len, reverse=True)


def _dept_alt_pattern(dept_codes: list[str]) -> str:
    parts = []
    for code in dept_codes:
        parts.append(re.escape(code).replace(r"\ ", r"\\s+"))
    return "|".join(parts)


# ==================================================
# PREREQ PARSER
# Storage semantics:
#   - top-level list => AND
#   - sublist => OR
#   - OR item can be a sub-sublist => AND group
# ==================================================


def _count_course_tokens(obj) -> int:
    if obj is None:
        return 0
    if isinstance(obj, str):
        return 1
    if isinstance(obj, list):
        return sum(_count_course_tokens(x) for x in obj)
    return 0


def parse_prerequisites(text: str) -> list:
    if not text:
        return []

    s = re.sub(r"\s+", " ", text).strip()
    s = re.sub(r"^\s*(Prerequisites|Requisites)\s*:\s*", "", s, flags=re.IGNORECASE)

    # & behaves like AND
    s = re.sub(r"\s*&\s*", " AND ", s)

    # remove grade phrases
    s = re.sub(
        r"(?i)\b['\"]?[A-F](?:[+\-\u2010\u2011\u2012\u2013\u2014\u2212])?['\"]?\s*or\s*better\s*in\b",
        " ",
        s,
    )
    s = re.sub(r"(?i)\bor\s+better\b", " better", s)

    # remove common non-course constraints
    s = re.sub(r"(?i)\bFoundational Courses complete\b", " ", s)

    # strip parentheses that contain NO course codes (keeps real boolean grouping)
    # Build dept alternation on normalized (space-free) codes because we collapsed them in s above
    if DEPT_CODES:
        dept_codes_norm = [re.sub(r"\s+", "", c) for c in DEPT_CODES]
        dept_alt = "|".join(re.escape(c) for c in sorted(dept_codes_norm, key=len, reverse=True))
    else:
        dept_alt = r"[A-Z]{2,6}(?:\s+[A-Z]{1,4})*"

    course_in_chunk_re = re.compile(rf"\b(?:{dept_alt})\s*\d{{4}}\b", re.IGNORECASE)

    def _strip_non_course_parens(m: re.Match) -> str:
        chunk = m.group(0)
        return chunk if course_in_chunk_re.search(chunk) else " "

    s = re.sub(r"\([^()]*\)", _strip_non_course_parens, s)
    s = re.sub(r"\s+", " ", s).strip()

    # Collapse multi-word dept codes in the text: "ME EN" -> "MEEN"
    multiword = [c for c in (DEPT_CODES or []) if " " in c]
    for code in multiword:
        collapsed = re.sub(r"\s+", "", code)  # "ME EN" -> "MEEN"
        code_pat = re.escape(code).replace(r"\ ", r"\s+")
        s = re.sub(rf"\b{code_pat}\b", collapsed, s, flags=re.IGNORECASE)

    # Build alternation ONLY for collapsed multiword depts (e.g., MEEN, CHEN, EDPS)
    multiword_alt = "|".join(
        re.escape(re.sub(r"\s+", "", c)) for c in sorted(multiword, key=len, reverse=True)
    )


    # Dept pattern: either collapsed multiword dept OR generic single-word dept
    # This guarantees HONOR3200 matches even if dept list logic changes.
    if multiword_alt:
        dept_pat = rf"(?:{multiword_alt}|[A-Z]{{2,6}})"
    else:
        dept_pat = r"[A-Z]{2,6}"

    # Used for paren-keeping test
    course_in_chunk_re = re.compile(rf"{dept_pat}\s*\d{{4}}", re.IGNORECASE)

    # Tokenizer
    token_re = re.compile(
        rf"(\()|(\))|\b(AND|OR)\b|"
        rf"\b({dept_pat})\s*(\d{{4}})\b|"
        rf"\b(\d{{4}})\b",
        re.IGNORECASE,
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
            dept_raw = m.group(4).upper().strip()
            dept_norm = re.sub(r"\s+", "", dept_raw)  # "ME EN" -> "MEEN"
            num = m.group(5)
            last_dept = dept_norm
            raw.append(("COURSE", f"{dept_norm}{num}"))
        elif m.group(6):
            num = m.group(6)
            if last_dept:
                raw.append(("COURSE", f"{last_dept}{num}"))

    if not raw:
        return []

    # Drop dangling AND/OR that appear after we strip AP / non-course options
    def is_left_operand(tt: str) -> bool:
        return tt in ("COURSE", "RP")

    def is_right_operand(tt: str) -> bool:
        return tt in ("COURSE", "LP")

    tokens = []
    for idx, (tt, tv) in enumerate(raw):
        if tt in ("AND", "OR"):
            prev_type = raw[idx - 1][0] if idx - 1 >= 0 else None
            next_type = raw[idx + 1][0] if idx + 1 < len(raw) else None
            if prev_type and next_type and is_left_operand(prev_type) and is_right_operand(next_type):
                tokens.append((tt, tv))
        else:
            tokens.append((tt, tv))

    if not tokens:
        return []

    # Recursive descent: AND precedence over OR
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
            consume("RP")  # tolerate missing RP
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

    # Normalize (flatten same operators)
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

    def to_store(node):
        if node[0] == "COURSE":
            return node[1]
        if node[0] == "AND":
            return [to_store(c) for c in node[1] if to_store(c) is not None]
        if node[0] == "OR":
            return [to_store(c) for c in node[1] if to_store(c) is not None]
        return None

    stored = to_store(ast)

    # Enforce top-level AND list
    if isinstance(stored, str):
        return [stored]
    if isinstance(stored, list):
        return stored if ast[0] == "AND" else [stored]
    return []


# ==================================================
# DETAILS PAGE (class-schedule) - description + prereqs
# ==================================================


def _clean_details_text(soup: BeautifulSoup) -> str:
    text = soup.get_text("\n", strip=True)
    for marker in FOOTER_MARKERS:
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
    return re.sub(r"\n{2,}", "\n", text).strip()


def scrape_details_schedule(subj: str, catno: str, section: str):
    url = f"{BASE}description.html?subj={subj}&catno={catno}&section={section}"
    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    full = _clean_details_text(soup)

    # Extract prerequisites: stop at Corequisites if present
    prereq_text = ""
    m = re.search(r"(?i)Prerequisites\s*:\s*(.*)", full)
    if m:
        prereq_text = m.group(1).strip()
        prereq_text = re.split(r"(?i)\bCorequisites\s*:\b", prereq_text)[0].strip()

    # Description block
    desc = ""
    m2 = re.search(r"(?im)^Description\s*$", full)
    if m2:
        tail = full[m2.end():].strip()
        # stop at next header-ish item
        stop = re.search(
            r"(?im)^(Prerequisites\s*:|Requisites\s*:|Corequisites\s*:|Units\s*:|Course Components\s*:|Enrollment Information\b|Enrollment Requirement\s*:|Course Detail\b)",
            tail,
        )
        if stop:
            tail = tail[: stop.start()].strip()
        desc = " ".join([ln.strip() for ln in tail.splitlines() if ln.strip()]).strip()

    return desc, parse_prerequisites(prereq_text)


# ==================================================
# CATALOG (catalog.utah.edu) - course-level prereqs
# ==================================================


def _catalog_find_course_page(subj: str, catno: str) -> str | None:
    # Search the catalog course list for this subject+catno
    params = {"subjectCode": subj, "page": 1, "cq": catno}
    r = requests.get(CATALOG_LIST_URL, params=params, headers=HEADERS, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    # Find first link that looks like /courses/<id>
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/courses/"):
            # sanity check text contains catno
            txt = a.get_text(" ", strip=True)
            if re.search(rf"\b{re.escape(subj)}\s*{re.escape(catno)}\b", txt):
                return "https://catalog.utah.edu" + href

    # fallback: if no direct match on anchor text, just take first /courses/ link
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/courses/"):
            return "https://catalog.utah.edu" + href

    return None


def scrape_prereqs_catalog(subj: str, catno: str) -> list:
    url = _catalog_find_course_page(subj, catno)
    if not url:
        return []

    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    text = soup.get_text("\n", strip=True)

    # Find prerequisites section in catalog page
    # Common pattern: "Required Requisite (s): Prerequisites: ..."
    m = re.search(r"(?i)Prerequisites\s*:\s*(.+)", text)
    if not m:
        return []

    tail = m.group(1).strip()

    # stop at known headings
    tail = re.split(r"(?i)\b(Corequisites\s*:|Semester Credit Hours|Download Catalog as PDF|Powered by)\b", tail)[0]
    tail = re.sub(r"\s+", " ", tail).strip()

    return parse_prerequisites(tail)


# ==================================================
# BASE PAGE: schedule + location from meeting table
# ==================================================


def _table_contains_meeting(table: Tag) -> bool:
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) >= 2:
            left = cells[0].get_text(" ", strip=True)
            if MEETING_CELL_RE.search(left):
                return True
    return False


def _find_h3_with_meeting_table(soup: BeautifulSoup, subj: str, catno: str, section: str) -> Tag | None:
    pat = re.compile(rf"\b{subj}\s*{catno}\s*-\s*{re.escape(section)}\b")
    hits = [h3 for h3 in soup.find_all("h3") if pat.search(h3.get_text(" ", strip=True))]

    # Prefer the h3 whose next table actually contains meeting rows
    for h3 in hits:
        for el in h3.next_elements:
            if isinstance(el, Tag) and el.name == "h3":
                break
            if isinstance(el, Tag) and el.name == "table":
                if _table_contains_meeting(el):
                    return h3
                break

    # fallback to duplicated structure: second match (site often duplicates)
    if len(hits) >= 2:
        return hits[1]
    return hits[0] if hits else None


def extract_schedule_and_location_from_base(soup: BeautifulSoup, subj: str, catno: str, section: str):
    anchor = _find_h3_with_meeting_table(soup, subj, catno, section)
    if not anchor:
        return "", ""

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

    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        sched_raw = cells[0].get_text(" ", strip=True)
        loc_raw = cells[1].get_text(" ", strip=True)

        if not MEETING_CELL_RE.search(sched_raw):
            continue

        sched = re.sub(r"\s*/\s*", "/", sched_raw)
        sched = re.sub(r"\s*-\s*", "-", sched)
        schedules.append(sched)

        if loc_raw:
            locations.append(re.sub(r"\s{2,}", " ", loc_raw).strip(" ,"))

    return ", ".join(_uniq(schedules)), ", ".join(_uniq(locations))


# ==================================================
# MAIN SCRAPER
# ==================================================


def scrape() -> list[dict]:
    html = request_text(LIST_URL)
    soup = BeautifulSoup(html, "html.parser")

    # First pass: build all section records from schedule page
    sections: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for h3 in soup.find_all("h3"):
        header_text = h3.get_text(" ", strip=True)
        m = H3_RE.match(header_text)
        if not m:
            continue

        subj, catno, sec_raw, name = m.groups()
        if subj.upper() != SUBJECT.upper():
            continue

        sec_norm = normalize_section(sec_raw)
        course_id = f"{subj}{catno}"

        key = (course_id, sec_norm)
        if key in seen:
            continue
        seen.add(key)

        instructor = component = units = seats = ""

        ul = h3.find_next("ul")
        if ul:
            for li in ul.find_all("li"):
                t = li.get_text(" ", strip=True)
                if t.startswith("Instructor:"):
                    instructor = t.split(":", 1)[1].strip()
                elif t.startswith("Component:"):
                    component = t.split(":", 1)[1].strip()
                elif t.startswith("Units:"):
                    units = t.split(":", 1)[1].strip()
                elif t.startswith("Seats Available:"):
                    seats = t.split(":", 1)[1].strip()

        schedule, location = extract_schedule_and_location_from_base(soup, subj, catno, sec_raw)
        description, prereqs_sched = scrape_details_schedule(subj, catno, sec_raw)

        sections.append(
            {
                "course_id": course_id,
                "course_name": name,
                "section": sec_norm,
                "units": units,
                "instructor": instructor,
                "component": component,
                "available_seats": seats,
                "schedule": schedule,
                "location": location,
                "description": description,
                "prerequisites": prereqs_sched,
                "_subj": subj,
                "_catno": catno,
            }
        )

    # Second pass: catalog prereqs (course-level) and override when better
    catno_set = {(c["_subj"], c["_catno"]) for c in sections}
    catalog_map: dict[tuple[str, str], list] = {}

    for subj, catno in sorted(catno_set):
        try:
            catalog_map[(subj, catno)] = scrape_prereqs_catalog(subj, catno)
        except Exception:
            catalog_map[(subj, catno)] = []

    for c in sections:
        key = (c["_subj"], c["_catno"])
        cat_pr = catalog_map.get(key, [])
        sched_pr = c.get("prerequisites", [])

        # Override only if catalog has more actual course tokens
        if _count_course_tokens(cat_pr) > _count_course_tokens(sched_pr):
            c["prerequisites"] = cat_pr

        # drop internal keys
        del c["_subj"]
        del c["_catno"]

    return sections


# ==================================================
# WRITE OUTPUT NEXT TO SCRIPT
# ==================================================


def main():
    global DEPT_CODES
    DEPT_CODES = fetch_department_codes()

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
