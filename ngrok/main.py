#poetry run uvicorn main:app --reload --port 5000 (start poetry server)
#ngrok http 5000 (start ngrok server)
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel     
import requests

OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
API_KEY = "local"          # whatever you use nowW
MODEL = "deepseek-r1:8b"      # this can change whenever, just a test

app = FastAPI()

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

preprompt = " Your role is a class schedule and class advising at The University of Utah. Always address the school as The University of Utah " \
            " You can only talk about classes the student is asking about ONLY at the University of Utah." \
            " Your responses are short and concise. Quickly answer only the question the user asks and nothing else. " \
            " Please match the language of the user chatting with you." \
            " You can only talk about course descriptions" \
            " You can only suggest other classes ONLY if the user asks." \
            " Keep your responses no longer than 2 sentences unless its about classes the user is asking about"

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    print("-----------")
    try:
        print("User: " + req.message)
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
        print("AI: " + reply)
        return ChatResponse(reply=reply)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))             #TODO: make detailed exception later 