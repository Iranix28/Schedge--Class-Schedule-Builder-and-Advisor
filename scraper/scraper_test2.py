import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time
import re
from pathlib import Path

# === CONFIG ===
BASE_URL = "https://class-schedule.app.utah.edu/main/1264/"
LOCAL_HTML = Path("course_page.html")
OUTPUT_FILE = Path("cs_courses_detailed.txt")

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

# --- Load main course list ---
if not LOCAL_HTML.exists():
    raise FileNotFoundError("❌ 'course_page.html' not found. Download it first.")

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

    # --- Instructor ---
    instructor = "N/A"
    for li in card.find_all("li"):
        text = li.get_text(" ", strip=True)
        if "Instructor" in text:
            a = li.find("a")
            instructor = a.get_text(" ", strip=True) if a else text.split("Instructor:", 1)[-1].strip()
            break

    # --- Schedule ---
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

    # --- Units and Components (from main page) ---
    units = "N/A"
    components = "N/A"
    for li in card.find_all("li"):
        text = li.get_text(" ", strip=True)
        if "Units:" in text:
            units = text.split(":", 1)[-1].strip()
        elif "Component:" in text:
            components = text.split(":", 1)[-1].strip()

    # --- Details page for prereqs + full description ---
    details_link = card.find("a", string=lambda s: s and "Class Details" in s)
    prereqs = full_desc = "N/A"
    if details_link and details_link.get("href"):
        detail_url = urljoin(BASE_URL, details_link["href"])
        print(f"[{idx}] Fetching details for {course_code}")
        try:
            resp = requests.get(detail_url, timeout=10)
            resp.raise_for_status()
            d_soup = BeautifulSoup(resp.text, "lxml")

            prereqs = extract_label_value(d_soup, r"(Pre|Co)-?requisites?")
            desc = extract_label_value(d_soup, r"Description")
            if desc != "N/A":
                full_desc = desc
            else:
                # fallback: look for long <p> elements
                paras = [p.get_text(" ", strip=True) for p in d_soup.find_all("p") if len(p.get_text(strip=True)) > 40]
                if paras:
                    full_desc = " ".join(paras)
            time.sleep(0.3)
        except Exception as e:
            print(f"⚠ Error fetching {detail_url}: {e}")

    courses.append({
        "code": course_code,
        "section": section,
        "title": title,
        "instructor": instructor,
        "schedule": schedule,
        "units": units,
        "components": components,
        "prerequisites": prereqs,
        "description": full_desc,
    })

# --- Save results ---
with OUTPUT_FILE.open("w", encoding="utf-8") as f:
    for c in courses:
        f.write(f"{c['code']} - {c['title']} (Section {c['section']})\n")
        f.write(f"Instructor: {c['instructor']}\n")
        f.write(f"Schedule: {c['schedule']}\n")
        f.write(f"Units: {c['units']}\n")
        f.write(f"Components: {c['components']}\n")
        f.write(f"Prerequisites/Corequisites: {c['prerequisites']}\n")
        f.write(f"Description: {c['description']}\n")
        f.write("-" * 70 + "\n")

print(f"\n✅ Done! Saved detailed info for {len(courses)} courses to {OUTPUT_FILE.resolve()}")
