from fastapi import APIRouter
from backend.scraper.RMP_scraper import get_professor_data

router = APIRouter(prefix="/professor-rating", tags=["rmp"])

@router.get("/{professor_name}")
def get_professor_rating(professor_name: str):
    data = get_professor_data(professor_name)
    if not data:
        return {"error": "No data found for this professor"}
    return data