import requests
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.database.schema import Course  # <- make sure this points to your schema file
from app.database.query_routers.departments_query import get_department

EMBEDDING_MODEL = "mxbai-embed-large"
OLLAMA_URL = "http://host.docker.internal:11434/api/embeddings"

def embedding_model(text: str) -> list[float]:
    """Generate embeddings using Ollama."""
    payload = {"model": EMBEDDING_MODEL, "prompt": text}
    response = requests.post(OLLAMA_URL, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()["embedding"]

def update_course_embeddings():
    db: Session = SessionLocal()

    courses = db.query(Course).all()
    print(f"Found {len(courses)} courses to embed.")

    for idx, course in enumerate(courses, start=1):
        department = get_department(db, course.department_id)
        text_to_embed = (
                            f"Course: {department.subject} {course.number}. "
                            f"Title: {course.name}. "
                            f"Description: {course.description}. "
                            f"This course is part of the {department.subject} curriculum. "
                            f"Students may take this course as part of their degree program."
                        )
        try:
            emb_vector = embedding_model(text_to_embed)
            if len(emb_vector) != 1024:
                print(f"Skipping {course.number}: embedding has wrong length {len(emb_vector)}")
                continue

            course.embedding = emb_vector
            db.add(course)

            if idx % 10 == 0:
                db.commit()

            print(f"[{idx}/{len(courses)}] Embedded {course.number} - {course.name}")

        except Exception as e:
            print(f"Error embedding {course.number}: {e}")

    db.commit()
    db.close()
    print("All course embeddings updated.")

if __name__ == "__main__":
    update_course_embeddings()
