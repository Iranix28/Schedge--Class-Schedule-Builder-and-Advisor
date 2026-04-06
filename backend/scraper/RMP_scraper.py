import requests
import json
import re
from bs4 import BeautifulSoup
from difflib import SequenceMatcher

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.ratemyprofessors.com/",
}

def search_professor(professor_name: str) -> dict | None:
    """
    Scrapes the search results page and extracts professor data
    from the embedded __RELAY_STORE__ JSON blob.
    """
    url = f"https://www.ratemyprofessors.com/search/professors/1606?q={requests.utils.quote(professor_name)}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Search page request failed: {e}")
        return None

    soup = BeautifulSoup(response.text, "html.parser")

    script_tag = soup.find("script", string=re.compile(r"window\.__RELAY_STORE__"))
    if not script_tag:
        print("Could not find relay store in page.")
        return None

    match = re.search(r"window\.__RELAY_STORE__\s*=\s*(\{.*?\});", script_tag.string, re.DOTALL)
    if not match:
        print("Could not parse relay store.")
        return None

    relay_store = json.loads(match.group(1))

    candidates = [
        v for v in relay_store.values()
        if isinstance(v, dict) and v.get("__typename") == "Teacher"
    ]

    if not candidates:
        print(f"No professors found for '{professor_name}'.")
        return None

    best = max(
        candidates,
        key=lambda p: SequenceMatcher(
            None,
            professor_name.lower(),
            f"{p.get('firstName', '')} {p.get('lastName', '')}".lower()
        ).ratio()
    )

    return best


def scrape_tags(numeric_id: str) -> list[str]:
    url = f"https://www.ratemyprofessors.com/professor/{numeric_id}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Tag scrape failed: {e}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")

    tags_header = soup.find("div", class_=lambda c: c and "TagsHeader" in c)
    if not tags_header:
        return []

    tag_container = tags_header.find_parent()
    if not tag_container:
        return []

    tag_elements = tag_container.find_all("span", class_=lambda c: c and "Tag-" in c)
    return [tag.get_text(strip=True) for tag in tag_elements]

def get_professor_data(professor_name: str) -> dict | None:
    professor = search_professor(professor_name)
    if not professor:
        return None

    numeric_id = professor.get("legacyId")
    wta = professor.get("wouldTakeAgainPercent", -1)

    return {
        "name": f"{professor.get('firstName', '')} {professor.get('lastName', '')}",
        "department": professor.get("department"),
        "rating": professor.get("avgRating"),
        "difficulty": professor.get("avgDifficulty"),
        "num_ratings": professor.get("numRatings"),
        "would_take_again": round(wta, 1) if wta and wta >= 0 else None,
        "tags": scrape_tags(numeric_id),
        "rmp_url": f"https://www.ratemyprofessors.com/professor/{numeric_id}",
    }