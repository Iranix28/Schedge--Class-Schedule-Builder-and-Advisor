from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

app = FastAPI()

worker = None  # single client

# Pydantic model for /chat input
class ChatRequest(BaseModel):
    prompt: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/worker")
async def worker_ws(ws: WebSocket):
    """
    WebSocket endpoint for the worker (client) to connect.
    Keeps the connection alive so /chat can communicate with it.
    """
    global worker
    await ws.accept()
    worker = ws
    print("[Worker] Connected to server")

    try:
        # Keep connection alive without blocking receive_json in /chat
        while True:
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        print("[Worker] Disconnected")
    finally:
        worker = None

@app.post("/chat")
async def chat(req: ChatRequest):
    """
    HTTP endpoint to send a prompt to the worker and get the result.
    """
    global worker
    if worker is None:
        return JSONResponse({"error": "No worker connected"}, status_code=503)

    # Send prompt to worker
    await worker.send_json({"prompt": req.prompt})
    print(f"[Server] Sent prompt to worker: {req.prompt}")

    try:
        # Wait indefinitely until worker responds
        response = await worker.receive_json()
        result = response.get("result", "No result returned")
        print(f"[Server] Received result from worker: {result}")
        return {"reply": result}
    except Exception as e:
        print(f"[Server] Error receiving result from worker: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
