from bs4 import BeautifulSoup
import re
from pathlib import Path

# Load your downloaded HTML file
html_path = Path("course_page.html")

with html_path.open("r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "lxml")

# Each course is in a div with class "class-info"
course_cards = soup.find_all("div", class_="class-info")

courses = []

for card in course_cards:
    # --- Course Code & Title ---
    header = card.find("h3")
    if not header:
        continue

    code_tag = header.find("a")
    course_code = code_tag.get_text(strip=True) if code_tag else ""

    span_texts = [s.get_text(strip=True) for s in header.find_all("span")]
    section = span_texts[0] if len(span_texts) > 0 else ""
    title = span_texts[1] if len(span_texts) > 1 else ""

    # --- Instructor ---
    instructor = "N/A"
    for li in card.find_all("li"):
        text = li.get_text(" ", strip=True)
        if "Instructor" in text:
            link = li.find("a")
            if link:
                instructor = link.get_text(" ", strip=True)
            else:
                instructor = text.split("Instructor:", 1)[-1].strip()
            break

    # --- Days / Times ---
    days = []
    times = []
    time_table = card.find("table", class_="time-table")
    if time_table:
        for s in time_table.select("span[data-day]"):
            days.append(s.get_text(" ", strip=True))
        for s in time_table.select("span[data-time]"):
            times.append(s.get_text(" ", strip=True))
    if days and times and len(days) == len(times):
        day_time = " | ".join(f"{d} {t}" for d, t in zip(days, times))
    elif days or times:
        day_time = " / ".join(days + times)
    else:
        day_time = "N/A"

    # --- Description ---
    description = "N/A"
    hr = card.find("hr")
    if hr:
        next_span = hr.find_next(["span", "p"])
        if next_span and next_span.get_text(strip=True):
            description = next_span.get_text(" ", strip=True)

    # Backup methods for missing descriptions
    if description == "N/A":
        d = card.select_one(".class-notes-divider")
        if d:
            next_span = d.find_next("span")
            if next_span and next_span.get_text(strip=True):
                description = next_span.get_text(" ", strip=True)
    if description == "N/A":
        body = card.find("div", class_="card-body")
        if body:
            spans = [s for s in body.find_all("span") if len(s.get_text(strip=True)) > 20]
            if spans:
                description = " ".join(s.get_text(" ", strip=True) for s in spans)

    courses.append({
        "code": course_code,
        "section": section,
        "title": title,
        "instructor": instructor,
        "time": day_time,
        "description": description,
    })

# --- Save to text file ---
out_path = Path("cs_courses.txt")
with out_path.open("w", encoding="utf-8") as f:
    for c in courses:
        f.write(f"{c['code']} - {c['title']} (Section {c['section']})\n")
        f.write(f"Instructor: {c['instructor']}\n")
        f.write(f"Time: {c['time']}\n")
        f.write(f"Description: {c['description']}\n")
        f.write("-" * 60 + "\n")

print(f"✅ Parsed {len(courses)} courses and saved to {out_path.resolve()}")
