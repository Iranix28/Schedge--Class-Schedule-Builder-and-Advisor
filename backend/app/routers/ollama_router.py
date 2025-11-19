from fastapi import APIRouter, HTTPException
from app.models.models import ChatRequest, ChatResponse
import requests

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
        payload = {
            "model": MODEL,
            "stream": False,  # keep it simple for now
            "messages": [
                {"role": "system", "content": preprompt},
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