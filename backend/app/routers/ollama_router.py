from fastapi import APIRouter, HTTPException
from app.models.models import ChatRequest, ChatResponse
import requests
from pathlib import Path

from app.config.env_variables import OLLAMA_URL, API_KEY, MODEL


router = APIRouter(prefix="/ollama", tags=["Ollama"])

preprompt = " Your role is a class schedule and class advising at The University of Utah. Always address the school as The University of Utah " \
            " You can only talk about classes the student is asking about ONLY at the University of Utah." \
            " Your responses are short and concise. Quickly answer only the question the user asks and nothing else. " \
            " Please match the language of the user chatting with you." \
            " You can only talk about course descriptions" \
            " You can only suggest other classes ONLY if the user asks." \
            " Keep your responses no longer than 2 sentences unless its about classes the user is asking about"

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        r = requests.post(
            f"{OLLAMA_URL}/chat",
            json=req.dict(),
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        r.raise_for_status()
        data = r.json()
        reply = data["reply"]

        return ChatResponse(reply=reply)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) #TODO: update excception