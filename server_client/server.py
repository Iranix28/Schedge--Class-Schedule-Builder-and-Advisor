from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
import uuid
import asyncio

app = FastAPI()

workers = set()  # support multiple workers
pending = {}

@app.websocket("/worker")
async def worker_ws(ws: WebSocket):
    await ws.accept()
    workers.add(ws)
    print("Worker connected")

    try:
        while True:
            data = await ws.receive_json()
            job_id = data["job_id"]
            result = data["result"]

            if job_id in pending:
                pending[job_id].set_result(result)
    except Exception as e:
        print("Worker disconnected:", e)
    finally:
        workers.remove(ws)

@app.post("/chat")
async def chat(data: dict):
    if not workers:
        return JSONResponse({"error": "No worker connected"}, status_code=503)

    job_id = str(uuid.uuid4())
    future = asyncio.get_event_loop().create_future()
    pending[job_id] = future

    # pick one worker (could do load balancing)
    worker = next(iter(workers))
    await worker.send_json({
        "job_id": job_id,
        "prompt": data["prompt"]
    })

    # Wait indefinitely until worker responds
    result = await future
    pending.pop(job_id, None)

    return {"response": result}