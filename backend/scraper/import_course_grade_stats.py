import argparse
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pandas as pd
from sqlalchemy import select

from app.database.session import SessionLocal
from app.database.query_routers.course_grade_stats_query import upsert_course_grade_stats
from app.database.schema import Department, Course

DEFAULT_GRADE_FILE = Path(__file__).resolve().parent / "Grade Tabs.csv"
GRADE_COLUMNS = ["A", "B", "C", "D", "E", "CR", "NC", "W", "Other"]

def q5(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP)


def q3(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def safe_rate(numerator: int, denominator: int) -> Decimal:
    if denominator == 0:
        return Decimal("0.00000")
    return q5(numerator / denominator)


def safe_optional_rate(numerator: int, denominator: int):
    if denominator == 0:
        return None
    return q5(numerator / denominator)


def safe_optional_gpa(a: int, b: int, c: int, d: int, e: int, letter_graded_students: int):
    if letter_graded_students == 0:
        return None

    gpa = ((4 * a) + (3 * b) + (2 * c) + (1 * d) + (0 * e)) / letter_graded_students
    return q3(gpa)


def split_subject(subject_value: str) -> tuple[str, str]:
    """
    Example:
    'ABRD - Learning Abroad' -> ('ABRD', 'Learning Abroad')
    """
    subject_str = str(subject_value).strip()
    code, sep, name = subject_str.partition(" - ")

    subject_code = code.strip()
    subject_name = name.strip() if sep else subject_code

    return subject_code, subject_name


def read_grade_file(file_path: Path) -> pd.DataFrame:
    suffix = file_path.suffix.lower()

    if suffix in {".xlsx", ".xls"}:
        df = pd.read_excel(file_path)

    elif suffix == ".csv":
        # Your grade CSV is UTF-16 and tab-separated
        try:
            df = pd.read_csv(file_path, sep="\t", encoding="utf-16")
        except UnicodeError:
            # fallback for more normal CSVs
            df = pd.read_csv(file_path)

    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    required_columns = {"Subject", "Course Level", "Catnbr", *GRADE_COLUMNS}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {sorted(missing_columns)}")

    df = df.copy()

    df["Subject"] = df["Subject"].ffill()
    df["Course Level"] = df["Course Level"].ffill()
    df["Catnbr"] = df["Catnbr"].astype(str).str.strip()

    df = df[
        ~(
            df["Subject"].astype(str).str.strip().str.upper().eq("GRAND TOTAL")
            | df["Catnbr"].astype(str).str.strip().str.upper().eq("TOTAL")
        )
    ].copy()

    for col in GRADE_COLUMNS:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .replace({"nan": None, "None": None, "": None})
        )
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    return df


def build_department_lookup(db):
    departments = db.execute(select(Department)).scalars().all()
    return {
        dept.subject.strip().upper(): dept
        for dept in departments
    }


def build_course_lookup(db):
    courses = db.execute(select(Course)).scalars().all()
    return {
        (course.department_id, str(course.number).strip()): course
        for course in courses
    }


def build_values(row: pd.Series) -> dict:
    a = int(row["A"])
    b = int(row["B"])
    c = int(row["C"])
    d = int(row["D"])
    e = int(row["E"])
    cr = int(row["CR"])
    nc = int(row["NC"])
    w = int(row["W"])
    other = int(row["Other"])

    letter_graded_students = a + b + c + d + e
    total_students = letter_graded_students + cr + nc + w + other

    average_gpa = safe_optional_gpa(a, b, c, d, e, letter_graded_students)
    withdrawal_rate = safe_rate(w, total_students)
    completion_rate = safe_rate(total_students - w, total_students)

    failure_rate_letter_only = safe_optional_rate(e, letter_graded_students)
    failure_rate_total = safe_rate(e + nc, total_students)

    pass_rate_letter_only = safe_optional_rate(a + b + c + d, letter_graded_students)
    pass_rate_total = safe_rate(a + b + c + d + cr, total_students)

    a_rate = safe_optional_rate(a, letter_graded_students)
    b_or_better_rate = safe_optional_rate(a + b, letter_graded_students)
    c_or_better_rate = safe_optional_rate(a + b + c, letter_graded_students)

    letter_graded_rate = safe_rate(letter_graded_students, total_students)
    nonstandard_grading_rate = safe_rate(cr + nc + other, total_students)
    other_rate = safe_rate(other, total_students)

    has_letter_grades = letter_graded_students > 0
    has_nonstandard_grading = (cr + nc + other) > 0
    is_low_sample = total_students < 30

    grade_distribution = {
        "A": a,
        "B": b,
        "C": c,
        "D": d,
        "E": e,
        "CR": cr,
        "NC": nc,
        "W": w,
        "Other": other,
    }

    return {
        "a_count": a,
        "b_count": b,
        "c_count": c,
        "d_count": d,
        "e_count": e,
        "cr_count": cr,
        "nc_count": nc,
        "w_count": w,
        "other_count": other,
        "total_students": total_students,
        "letter_graded_students": letter_graded_students,
        "average_gpa": average_gpa,
        "withdrawal_rate": withdrawal_rate,
        "completion_rate": completion_rate,
        "failure_rate_letter_only": failure_rate_letter_only,
        "failure_rate_total": failure_rate_total,
        "pass_rate_letter_only": pass_rate_letter_only,
        "pass_rate_total": pass_rate_total,
        "a_rate": a_rate,
        "b_or_better_rate": b_or_better_rate,
        "c_or_better_rate": c_or_better_rate,
        "letter_graded_rate": letter_graded_rate,
        "nonstandard_grading_rate": nonstandard_grading_rate,
        "other_rate": other_rate,
        "is_low_sample": is_low_sample,
        "has_letter_grades": has_letter_grades,
        "has_nonstandard_grading": has_nonstandard_grading,
        "grade_distribution": grade_distribution,
    }


def import_course_grade_stats(file_path: str):
    db = SessionLocal()

    try:
        df = read_grade_file(Path(file_path))

        department_lookup = build_department_lookup(db)
        course_lookup = build_course_lookup(db)

        inserted_or_updated = 0
        missing_departments = []
        missing_courses = []

        for _, row in df.iterrows():
            subject_code, _subject_name = split_subject(row["Subject"])
            catalog_number = str(row["Catnbr"]).strip()

            department = department_lookup.get(subject_code.upper())
            if department is None:
                missing_departments.append(subject_code)
                continue

            course = course_lookup.get((department.id, catalog_number))
            if course is None:
                missing_courses.append(f"{subject_code} {catalog_number}")
                continue

            values = build_values(row)

            upsert_course_grade_stats(
                db=db,
                course_id=course.id,
                values=values,
            )
            inserted_or_updated += 1

        db.commit()

        unique_missing_departments = sorted(set(missing_departments))
        unique_missing_courses = sorted(set(missing_courses))

        print(f"Done. Inserted/updated {inserted_or_updated} course grade rows.")

        if unique_missing_departments:
            print(f"\nMissing departments ({len(unique_missing_departments)}):")
            for dept in unique_missing_departments[:50]:
                print(f"  - {dept}")

        if unique_missing_courses:
            print(f"\nMissing courses ({len(unique_missing_courses)}):")
            for course_key in unique_missing_courses[:100]:
                print(f"  - {course_key}")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=str(DEFAULT_GRADE_FILE))
    args = parser.parse_args()

    import_course_grade_stats(args.file)