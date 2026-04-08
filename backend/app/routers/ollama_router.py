from fastapi import APIRouter, HTTPException
from app.models.models import ChatRequest, ChatResponse
import requests
from pathlib import Path
from typing import List
from app.config.env_variables import OLLAMA_URL, OLLAMA_EMBEDDED_URL, API_KEY, CHAT_MODEL, EMBEDDING_MODEL
from app.database.session import DBSession
from sqlalchemy import text

router = APIRouter(prefix="/ollama", tags=["Ollama"])

role = " Your role is a class schedule and class advising at The University of Utah. Always address the school as The University of Utah" \
            " You can only talk about classes the student is asking about ONLY at the University of Utah." \
            " If a student asks about a class, tell them the department along witht the course code such as CS 2420." \
            " Your responses are short and concise. Quickly answer only the question the user asks and nothing else. " \
            " Please match the language of the user chatting with you." \
            " You can only talk about course descriptions" \
            " You can only suggest other classes ONLY if the user asks." \
            " Keep your responses no longer than 2 sentences unless its about classes the user is asking about"


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, db: DBSession):
    print("in ollama router")

    #1. turn user message into embedding
    embedded_prompt = embedding_model(req.message)

    #2. retrieve relevant classes from db using embedded prompt
    retrieved_classes = retrieve_classes_from_db(embedded_prompt, db)
    print(f"Retrieved classes: {retrieved_classes}")

    # 3. Build preprompt with retrieved classes, user message, and role
    preprompt = build_rag_prompt(role, retrieved_classes, req.message)

    # 4. send preprompt to LLM
    chat = chat_model(CHAT_MODEL, preprompt)

    # 5. return response
    return chat

def build_rag_prompt(system_prompt: str, retrieved_classes: List[dict], user_message: str):
    
    context_block = "\n\n".join(
        f"{c['subject']} {c['number']}: {c['description']}"
        for c in retrieved_classes
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": f"Here are some relevant courses from The University of Utah based on the student's query, only pick from these classes: \n{context_block}"},
        {"role": "user", "content": user_message}
    ]

def chat_model(MODEL: str, messages: list[dict]):
    """
    Sends a chat request to the LLM using the prepared messages.
    messages: a list of {"role": ..., "content": ...} dicts
    """
    try:
        payload = {
            "model": MODEL,
            "stream": False,  # keep it simple for now
            "messages": messages,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        }

        r = requests.post(OLLAMA_URL, json=payload, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()

        # standard OpenAI-style response
        reply = data["choices"][0]["message"]["content"]
        return ChatResponse(reply=reply)

    except Exception as e:
        print("Chat model error:", e)
        raise HTTPException(status_code=500, detail=str(e))             #TODO: make detailed exception later \
    
def embedding_model(text: str) -> list[float]:
    """
    Call Ollama's /v1/embeddings endpoint and return a list[float].
    Make sure you have an embedding model pulled, e.g.:
        ollama pull nomic-embed-text
    """

    print(f"EMBEDDING STARTS")
    payload = {
        "model": EMBEDDING_MODEL,
        "input": text,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }

    r = requests.post(OLLAMA_EMBEDDED_URL, json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    data = r.json()
    embedding = data["data"][0]["embedding"]
    embedding_length = len(embedding) 
    print(f"Generated embedding for text: {text}")
    print(f"Length of the embedding: {embedding_length}")
    #print (embedding)
    # OpenAI-style: { "data": [ { "embedding": [...] } ] }
    return embedding

def retrieve_classes_from_db(query_embedding: List[float], db: DBSession, limit: int = 3) -> List[dict]:
    try:
        query_embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"

        result = db.execute(
            text("""
                SELECT 
                    c.id,
                    c.number,
                    c.name,
                    c.units,
                    c.description,
                    d.subject
                FROM courses c
                JOIN departments d
                    ON c.department_id = d.id
                WHERE c.embedding IS NOT NULL
                ORDER BY c.embedding <-> (:query_embedding)::vector
                LIMIT :limit;
            """),
            {
                "query_embedding": query_embedding_str,
                "limit": limit
            }
        )

        rows = result.fetchall()

        return [
            {
                "course_id": r.id,
                "subject": r.subject,
                "number": r.number,
                "name": r.name,
                "units": r.units,
                "description": r.description
            }
            for r in rows
        ]

    except Exception as e:
        print("Error retrieving classes from DB:", e)
        return []