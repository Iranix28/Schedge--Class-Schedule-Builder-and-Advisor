from pydantic import BaseModel                  #have it in one right now but can seperate it out later if needed

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str