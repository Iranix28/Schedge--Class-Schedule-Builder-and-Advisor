import argparse
import csv
import json
import os
import random
import re
import sys
import time
from typing import Any
from itertools import product
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup
from bs4.element import Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

TERM_SEASON = "Fall"
TERM_YEAR = 2026
TERM_CODE = os.environ.get("UOFU_TERM", "1268")
BASE = f"https://class-schedule.app.utah.edu/main/{TERM_CODE}/"
CATALOG_LIST_URL = "https://catalog.utah.edu/courses"

MAX_DISTRIBUTED_OPTIONS = 12

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}

CSV_COLUMNS = [
    "course_id",
    "department_subject",
    "department_display_subject",
    "department_name",
    "course_number",
    "course_name",
    "section",
    "term_season",
    "term_year",
    "units",
    "instructor",
    "component",
    "available_seats",
    "schedule",
    "location",
    "description",
    "prerequisites",
]

H3_RE = re.compile(r"^([A-Z]{1,6}(?:\s+[A-Z]{1,6})*)\s*(\d+)\s*-\s*(\d+)\s*(.+)$")
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
DEPT_CODES: list[str] = []
DEPT_NAME_BY_SUBJECT: dict[str, str] = {}
DISPLAY_SUBJECT_BY_SUBJECT: dict[str, str] = {}


def make_session() -> requests.Session:
    retry = Retry(
        total=8,
        connect=8,
        read=8,
        status=8,
        backoff_factor=1.5,
        allowed_methods=frozenset(["GET", "HEAD"]),
        status_forcelist=[408, 425, 429, 500, 502, 503, 504],
        raise_on_status=False,
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)
    s = requests.Session()
    s.headers.update(HEADERS)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSION = make_session()


def sleep_brief(low: float = 0.15, high: float = 0.6) -> None:
    time.sleep(random.uniform(low, high))


def request_text(url: str, *, params: dict[str, Any] | None = None, timeout: tuple[int, int] = (20, 90), attempts: int = 5) -> str:
    global SESSION
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            resp = SESSION.get(url, params=params, timeout=timeout)
            if resp.status_code in {403, 429}:
                raise requests.HTTPError(f"HTTP {resp.status_code} for {resp.url}", response=resp)
            resp.raise_for_status()
            if not resp.text.strip():
                raise ValueError(f"Empty response body for {resp.url}")
            sleep_brief()
            return resp.text
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError, ValueError) as e:
            last_err = e
            wait = min(60.0, (2 ** (attempt - 1)) + random.uniform(0.2, 1.5))
            print(f"  retry {attempt}/{attempts} for {url} after error: {e}; sleeping {wait:.1f}s", flush=True)
            time.sleep(wait)
            if attempt == 3:
                # refresh pooled session in case server closed keep-alive connections badly
                try:
                    SESSION.close()
                except Exception:
                    pass
                SESSION = make_session()
    raise RuntimeError(f"Failed to fetch {url} after {attempts} attempts: {last_err}")


def normalize_subject(subject: str) -> str:
    return re.sub(r"\s+", "", (subject or "").upper())


def normalize_section(sec: str) -> str:
    try:
        return f"{int(sec):03d}"
    except Exception:
        return (sec or "").strip()


def _uniq(seq):
    seen = set()
    out = []
    for x in seq:
        x = (x or "").strip()
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def list_url_for_subject(subject_code: str) -> str:
    return BASE + f"class_list.html?subject={quote_plus(subject_code)}"


def _course_id_to_subject_number(course_id: str):
    m = re.match(r"^([A-Z]+)(\d{3,4})$", (course_id or "").strip().upper())
    if not m:
        return None, None
    return m.group(1), m.group(2)


def fetch_departments() -> list[tuple[str, str, str]]:
    html = request_text(BASE + "index.html")
    soup = BeautifulSoup(html, "html.parser")
    departments: dict[str, tuple[str, str, str]] = {}
    for a in soup.find_all("a"):
        t = a.get_text(" ", strip=True)
        m = re.match(r"^([A-Z]{1,6}(?:\s+[A-Z]{1,6})*)\s*\-\s+(.+)$", t)
        if not m:
            continue
        display_subject = m.group(1).strip()
        department_name = m.group(2).strip()
        subject_norm = normalize_subject(display_subject)
        departments[subject_norm] = (subject_norm, display_subject, department_name)
    if not departments:
        raise RuntimeError("No department codes found on index page")
    return sorted(departments.values(), key=lambda row: (len(row[1]), row[1]), reverse=True)


def parse_prerequisites(text: str) -> list:
    if not text:
        return []

    s = re.sub(r"\s+", " ", text).strip()
    s = re.sub(r"^\s*(Prerequisites|Requisites)\s*:\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*&\s*", " AND ", s)
    s = re.sub(
        r"(?i)\b['\"]?[A-F](?:[+\-\u2010\u2011\u2012\u2013\u2014\u2212])?['\"]?\s*or\s*better\s*in\b",
        " ",
        s,
    )
    s = re.sub(r"(?i)\bor\s+better\b", " better", s)
    s = re.sub(r"(?i)\bFoundational Courses complete\b", " ", s)
    s = re.sub(r"(?i)\bMajor OR Minor in [^.;:()]+", " ", s)
    s = re.sub(r"(?i)\bAP\s+[^.;:()]+score of\s+[0-9+]+", " ", s)
    s = re.sub(r"(?i)\bHigher Math\b", " ", s)

    if DEPT_CODES:
        dept_codes_norm = [normalize_subject(c) for c in DEPT_CODES]
        dept_alt = "|".join(re.escape(c) for c in sorted(dept_codes_norm, key=len, reverse=True))
    else:
        dept_alt = r"[A-Z]{2,6}"

    course_in_chunk_re = re.compile(rf"\b(?:{dept_alt})\s*\d{{4}}\b", re.IGNORECASE)

    def _strip_non_course_parens(m: re.Match) -> str:
        chunk = m.group(0)
        return chunk if course_in_chunk_re.search(chunk) else " "

    s = re.sub(r"\([^()]*\)", _strip_non_course_parens, s)
    s = re.sub(r"\s+", " ", s).strip()

    multiword = [c for c in (DEPT_CODES or []) if " " in c]
    for code in multiword:
        collapsed = normalize_subject(code)
        code_pat = re.escape(code).replace(r"\ ", r"\s+")
        s = re.sub(rf"\b{code_pat}\b", collapsed, s, flags=re.IGNORECASE)

    multiword_alt = "|".join(re.escape(normalize_subject(c)) for c in sorted(multiword, key=len, reverse=True))
    dept_pat = rf"(?:{multiword_alt}|[A-Z]{{2,6}})" if multiword_alt else r"[A-Z]{2,6}"

    token_re = re.compile(
        rf"(\()|(\))|\b(AND|OR)\b|\b({dept_pat})\s*(\d{{4}})\b|\b(\d{{4}})\b",
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
            dept_norm = normalize_subject(m.group(4))
            num = m.group(5)
            last_dept = dept_norm
            raw.append(("COURSE", f"{dept_norm}{num}"))
        elif m.group(6) and last_dept:
            raw.append(("COURSE", f"{last_dept}{m.group(6)}"))

    if not raw:
        return []

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
            consume("RP")
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
        return terms[0] if len(terms) == 1 else ("AND", terms)

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
        return terms[0] if len(terms) == 1 else ("OR", terms)

    def norm(node):
        if not node:
            return None
        t = node[0]
        if t == "COURSE":
            return node
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
        return children[0] if len(children) == 1 else (t, children)

    def to_store(node):
        if node[0] == "COURSE":
            return node[1]
        if node[0] in ("AND", "OR"):
            return [to_store(c) for c in node[1] if to_store(c) is not None]
        return None

    def dedupe_list(items):
        seen = set()
        out = []
        for item in items:
            key = json.dumps(item, sort_keys=True)
            if key not in seen:
                seen.add(key)
                out.append(item)
        return out

    def normalize_or_group(group):
        normalized_options = []
        for option in group:
            if isinstance(option, str):
                normalized_options.append(option)
            elif isinstance(option, list):
                normalized_options.extend(normalize_and_option(option))
        return dedupe_list(normalized_options)

    def normalize_and_option(option):
        if not option:
            return []
        if all(isinstance(x, str) for x in option):
            return [option]

        factors = []
        for part in option:
            if isinstance(part, str):
                factors.append([part])
            elif isinstance(part, list):
                or_choices = normalize_or_group(part)
                if not or_choices:
                    continue
                factors.append(or_choices)

        if not factors:
            return []

        combo_count = 1
        for f in factors:
            combo_count *= max(len(f), 1)
        if combo_count > MAX_DISTRIBUTED_OPTIONS:
            # leave original structure in place if expansion would explode
            flat = []
            for part in option:
                if isinstance(part, str):
                    flat.append(part)
                elif isinstance(part, list):
                    flat.append(part)
            return [flat]

        distributed = []
        for combo in product(*factors):
            built = []
            for piece in combo:
                if isinstance(piece, str):
                    built.append(piece)
                elif isinstance(piece, list):
                    built.extend(piece)
            distributed.append(built)
        return dedupe_list(distributed)

    def normalize_storage_shape(stored):
        if isinstance(stored, str):
            return [stored]
        if not isinstance(stored, list):
            return []
        top = []
        for item in stored:
            if isinstance(item, str):
                top.append(item)
            elif isinstance(item, list):
                top.append(normalize_or_group(item))
        return dedupe_list(top)

    ast = norm(parse_or())
    if not ast:
        return []
    stored = to_store(ast)
    if isinstance(stored, str):
        return [stored]
    if isinstance(stored, list):
        structured = stored if ast[0] == "AND" else [stored]
        return normalize_storage_shape(structured)
    return []


def _clean_details_text(soup: BeautifulSoup) -> str:
    text = soup.get_text("\n", strip=True)
    for marker in FOOTER_MARKERS:
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
    return re.sub(r"\n{2,}", "\n", text).strip()


def scrape_details_schedule(subj: str, catno: str, section: str) -> tuple[str, list]:
    url = f"{BASE}description.html?subj={quote_plus(subj)}&catno={catno}&section={section}"
    html = request_text(url)
    soup = BeautifulSoup(html, "html.parser")
    full = _clean_details_text(soup)

    prereq_text = ""
    m = re.search(r"(?i)Prerequisites\s*:\s*(.*)", full)
    if m:
        prereq_text = m.group(1).strip()
        prereq_text = re.split(r"(?i)\bCorequisites\s*:\b", prereq_text)[0].strip()

    desc = ""
    m2 = re.search(r"(?im)^Description\s*$", full)
    if m2:
        tail = full[m2.end():].strip()
        stop = re.search(
            r"(?im)^(Prerequisites\s*:|Requisites\s*:|Corequisites\s*:|Units\s*:|Course Components\s*:|Enrollment Information\b|Enrollment Requirement\s*:|Course Detail\b)",
            tail,
        )
        if stop:
            tail = tail[: stop.start()].strip()
        desc = " ".join([ln.strip() for ln in tail.splitlines() if ln.strip()]).strip()
    return desc, parse_prerequisites(prereq_text)


def _catalog_find_course_page(subj: str, catno: str) -> str | None:
    html = request_text(CATALOG_LIST_URL, params={"subjectCode": subj, "page": 1, "cq": catno}, timeout=(20, 120), attempts=4)
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/courses/"):
            txt = a.get_text(" ", strip=True)
            if re.search(rf"\b{re.escape(subj)}\s*{re.escape(catno)}\b", txt):
                return "https://catalog.utah.edu" + href
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/courses/"):
            return "https://catalog.utah.edu" + href
    return None


def scrape_prereqs_catalog(subj: str, catno: str) -> list:
    try:
        url = _catalog_find_course_page(subj, catno)
        if not url:
            return []
        html = request_text(url, timeout=(20, 120), attempts=4)
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text("\n", strip=True)
        m = re.search(r"(?i)Prerequisites\s*:\s*(.+)", text)
        if not m:
            return []
        tail = m.group(1).strip()
        tail = re.split(r"(?i)\b(Corequisites\s*:|Semester Credit Hours|Download Catalog as PDF|Powered by)\b", tail)[0]
        tail = re.sub(r"\s+", " ", tail).strip()
        return parse_prerequisites(tail)
    except Exception:
        return []


def _table_contains_meeting(table: Tag) -> bool:
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if len(cells) >= 2:
            left = cells[0].get_text(" ", strip=True)
            if MEETING_CELL_RE.search(left):
                return True
    return False


def _find_h3_with_meeting_table(soup: BeautifulSoup, subj: str, catno: str, section: str) -> Tag | None:
    pat = re.compile(rf"(?<!\w){re.escape(subj)}\s*{re.escape(catno)}\s*\-\s*{re.escape(section)}(?!\w)")
    hits = [h3 for h3 in soup.find_all("h3") if pat.search(h3.get_text(" ", strip=True))]
    for h3 in hits:
        for el in h3.next_elements:
            if isinstance(el, Tag) and el.name == "h3":
                break
            if isinstance(el, Tag) and el.name == "table":
                if _table_contains_meeting(el):
                    return h3
                break
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
        schedules.append(re.sub(r"\s*\/\s*", "/", re.sub(r"\s*\-\s*", "-", sched_raw)))
        if loc_raw:
            locations.append(re.sub(r"\s{2,}", " ", loc_raw).strip(" ,"))
    return ", ".join(_uniq(schedules)), ", ".join(_uniq(locations))


def _count_course_tokens(obj) -> int:
    if obj is None:
        return 0
    if isinstance(obj, str):
        return 1
    if isinstance(obj, list):
        return sum(_count_course_tokens(x) for x in obj)
    return 0


def scrape_subject(subject_code: str) -> list[dict]:
    html = request_text(list_url_for_subject(subject_code), timeout=(20, 120), attempts=6)
    soup = BeautifulSoup(html, "html.parser")
    sections: list[dict] = []
    seen: set[tuple[str, str]] = set()
    details_cache: dict[tuple[str, str, str], tuple[str, list]] = {}

    for h3 in soup.find_all("h3"):
        header_text = h3.get_text(" ", strip=True)
        m = H3_RE.match(header_text)
        if not m:
            continue
        subj_raw, catno, sec_raw, name = m.groups()
        if normalize_subject(subj_raw) != normalize_subject(subject_code):
            continue

        sec_norm = normalize_section(sec_raw)
        subj_norm = normalize_subject(subj_raw)
        course_id = f"{subj_norm}{catno}"
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

        schedule, location = extract_schedule_and_location_from_base(soup, subj_raw, catno, sec_raw)
        dkey = (subj_raw, catno, sec_raw)
        if dkey not in details_cache:
            details_cache[dkey] = scrape_details_schedule(subj_raw, catno, sec_raw)
        description, prereqs_sched = details_cache[dkey]

        sections.append(
            {
                "course_id": course_id,
                "department_subject": subj_norm,
                "department_display_subject": DISPLAY_SUBJECT_BY_SUBJECT.get(subj_norm, subj_raw),
                "department_name": DEPT_NAME_BY_SUBJECT.get(subj_norm, ""),
                "course_number": catno,
                "course_name": name,
                "section": sec_norm,
                "term_season": TERM_SEASON,
                "term_year": TERM_YEAR,
                "units": units,
                "instructor": instructor,
                "component": component,
                "available_seats": seats,
                "schedule": schedule,
                "location": location,
                "description": description,
                "prerequisites": prereqs_sched,
                "_subj": subj_raw,
                "_catno": catno,
            }
        )

    catno_set = {(c["_subj"], c["_catno"]) for c in sections}
    catalog_map: dict[tuple[str, str], list] = {}
    for subj, catno in sorted(catno_set):
        catalog_map[(subj, catno)] = scrape_prereqs_catalog(subj, catno)
    for c in sections:
        key = (c["_subj"], c["_catno"])
        cat_pr = catalog_map.get(key, [])
        sched_pr = c.get("prerequisites", [])
        if _count_course_tokens(cat_pr) > _count_course_tokens(sched_pr):
            c["prerequisites"] = cat_pr
        del c["_subj"]
        del c["_catno"]
    return sections


def write_rows(csv_path: str, rows: list[dict], append: bool) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(csv_path)), exist_ok=True)
    mode = "a" if append and os.path.exists(csv_path) else "w"
    with open(csv_path, mode, newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if mode == "w":
            w.writeheader()
        for row in rows:
            out = {k: row.get(k, "") for k in CSV_COLUMNS}
            out["prerequisites"] = json.dumps(out["prerequisites"], ensure_ascii=False)
            w.writerow(out)


def load_checkpoint(path: str) -> dict[str, Any]:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed_subjects": [], "failed_subjects": {}}


def save_checkpoint(path: str, state: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", action="append", default=[], help="One or more subjects to scrape, e.g. CS or 'ME EN'")
    parser.add_argument("--output", default="uofu_spring_2026_courses.csv")
    parser.add_argument("--checkpoint", default="uofu_spring_2026_checkpoint.json")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--max-subjects", type=int, default=None)
    parser.add_argument("--skip-catalog", action="store_true", help="Skip catalog prereq fallback to reduce network load")
    args = parser.parse_args()

    global DEPT_CODES, DEPT_NAME_BY_SUBJECT, DISPLAY_SUBJECT_BY_SUBJECT
    departments = fetch_departments()
    DEPT_CODES = [display for _, display, _ in departments]
    DISPLAY_SUBJECT_BY_SUBJECT = {subject_norm: display for subject_norm, display, _ in departments}
    DEPT_NAME_BY_SUBJECT = {subject_norm: name for subject_norm, _, name in departments}
    state = load_checkpoint(args.checkpoint) if args.resume else {"completed_subjects": [], "failed_subjects": {}}
    completed = set(state.get("completed_subjects", []))

    if args.subject:
        requested = {normalize_subject(s): s for s in args.subject}
        subjects = [s for s in DEPT_CODES if normalize_subject(s) in requested]
    else:
        subjects = DEPT_CODES[:]

    if args.max_subjects is not None:
        subjects = subjects[: args.max_subjects]

    if args.skip_catalog:
        global scrape_prereqs_catalog
        def scrape_prereqs_catalog(subj: str, catno: str) -> list:
            return []

    first_write = not (args.resume and os.path.exists(args.output))
    total_rows = 0
    for idx, subj in enumerate(subjects, start=1):
        if args.resume and subj in completed:
            print(f"[{idx}/{len(subjects)}] skipping completed subject: {subj}")
            continue
        print(f"[{idx}/{len(subjects)}] scraping subject: {subj}", flush=True)
        try:
            rows = scrape_subject(subj)
            write_rows(args.output, rows, append=not first_write)
            first_write = False
            total_rows += len(rows)
            completed.add(subj)
            state["completed_subjects"] = sorted(completed)
            state.setdefault("failed_subjects", {}).pop(subj, None)
            save_checkpoint(args.checkpoint, state)
            print(f"  wrote {len(rows)} rows for {subj}", flush=True)
            sleep_brief(0.35, 1.1)
        except Exception as e:
            print(f"  FAILED {subj}: {e}", flush=True)
            state.setdefault("failed_subjects", {})[subj] = str(e)
            save_checkpoint(args.checkpoint, state)
            sleep_brief(2.0, 4.5)
            continue

    print(f"Done. New rows written this run: {total_rows}")
    print(f"CSV: {os.path.abspath(args.output)}")
    print(f"Checkpoint: {os.path.abspath(args.checkpoint)}")
    if state.get("failed_subjects"):
        print("Failed subjects:")
        for subj, err in sorted(state["failed_subjects"].items()):
            print(f"  {subj}: {err}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
