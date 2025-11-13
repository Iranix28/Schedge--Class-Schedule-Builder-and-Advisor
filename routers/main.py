# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
#python -m uvicorn routers.main:app --reload --port 8000
#run command above to run server

OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
API_KEY = "local"          # whatever you use now
MODEL = "llama3.2:1b"      # this can change whenever, just a test

app = FastAPI()

# Allow your browser frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # in production restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

@app.post("/chat", response_model=ChatResponse)
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
        raise HTTPException(status_code=500, detail=str(e))
