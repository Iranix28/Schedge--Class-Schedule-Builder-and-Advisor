from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
import uuid
import asyncio
#uvicorn server:app --host 0.0.0.0 --port 8000 (to run server)

app = FastAPI()

worker = None
pending = {}

@app.websocket("/worker")
async def worker_ws(ws: WebSocket):
    global worker
    await ws.accept()
    worker = ws
    print("Worker connected")

    while True:
        data = await ws.receive_json()
        job_id = data["job_id"]
        result = data["result"]

        if job_id in pending:
            pending[job_id].set_result(result)

@app.post("/chat")
async def chat(data: dict):
    global worker
    if worker is None:
        return JSONResponse({"error": "Worker not connected"}, status_code=503)

    job_id = str(uuid.uuid4())
    future = asyncio.get_event_loop().create_future()
    pending[job_id] = future

    await worker.send_json({
        "job_id": job_id,
        "prompt": data["prompt"]
    })

    result = await future
    return {"response": result}
