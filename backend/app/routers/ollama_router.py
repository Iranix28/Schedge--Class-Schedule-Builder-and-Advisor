from fastapi import APIRouter, HTTPException
from app.models.models import ChatRequest, ChatResponse
import requests

from app.config.env_variables import OLLAMA_URL, API_KEY, MODEL


router = APIRouter(prefix="/ollama", tags=["Ollama"])

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        payload = {
            "model": MODEL,
            "stream": False,  # keep it simple for now
            "messages": [
                {"role": "user", "content": req.message}
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        }

        r = requests.post(OLLAMA_URL, json=payload, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()

        # standard OpenAI style response
        reply = data["choices"][0]["message"]["content"]
        return ChatResponse(reply=reply)

    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))             #TODO: make detailed exception later 