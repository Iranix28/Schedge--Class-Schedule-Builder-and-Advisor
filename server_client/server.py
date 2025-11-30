#poetry run uvicorn server:app --host 0.0.0.0 --reload

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from typing import Final

app = FastAPI(
    docs_url="/_internal/docs",
    redoc_url="/_internal/redoc",
    openapi_url="/_internal/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_WORKER_IPS: Final[set[str]] = {
}

ALLOWED_FORWARD_IPS: Final[set[str]] = {
}

worker: WebSocket | None = None  # only one worker used
pending_requests: dict[str, asyncio.Future] = {}  # so we can handle multiple requests
req_id_counter = 0

@app.websocket("/worker")
async def worker_ws(ws: WebSocket):
    """
    WebSocket endpoint for the worker (client) to connect.
    Keeps the connection alive so /chat can communicate with it.
    """

    client_ip = ws.client.host
    print(client_ip)
    print(f"[Server] Worker attempting connection from {client_ip}")
    if client_ip not in ALLOWED_WORKER_IPS:
        print(f"[Server] Rejected worker connection from unauthorized IP: {client_ip}")
        await ws.close(code=1008, reason="Not allowed")
        print("DANGER DANGER DANGER")
        exit(1)
        return
    
    global worker
    await ws.accept()
    worker = ws
    print("[Server] Worker connected")

    try:
        while True:
            client_response = await ws.receive_json()
            req_id = client_response.get("id")
            #print(req_id)
            if not req_id:
                print("[Server] Got message without id:", client_response)
                continue

            future_requests = pending_requests.pop(req_id, None)
            if future_requests and not future_requests.done():
                future_requests.set_result(client_response)
            else:
                print(f"[Server] No pending request for id={req_id}")
    except WebSocketDisconnect:
        print("[Server] Worker disconnected")
    finally:
        worker = None
        # If the worker disconnects, then screw all their pending requests
        for future_requests in pending_requests.values():
            if not future_requests.done():
                future_requests.set_exception(RuntimeError("Worker disconnected"))
        pending_requests.clear()


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_any(full_path: str, request: Request):
    
    client_ip = request.client.host
    print("Client ip" + client_ip)
    if client_ip not in ALLOWED_FORWARD_IPS:
        print(f"[Server] Rejected forward request from unauthorized IP: {client_ip}")
        return JSONResponse({"error": "YOU SHALL NOT PASS, please don't hack me"}, status_code=403)
    
    if full_path == "worker":
        return JSONResponse({"detail": "Reserved path"}, status_code=404)

    global worker
    if worker is None:
        return JSONResponse({"error": "No worker connected"}, status_code=503)

    body_bytes = await request.body()
    query_string = request.url.query

    global req_id_counter
    req_id = str(req_id_counter)
    req_id_counter += 1
    better_ngrok_payload = {
        "id": req_id,
        "method": request.method,
        "path": "/" + full_path,  
        "query": query_string,
        "headers": dict(request.headers),
        "body": body_bytes.decode("utf-8", errors="ignore"),  
    }

    loop = asyncio.get_event_loop()
    future: asyncio.Future = loop.create_future()
    pending_requests[req_id] = future

    await worker.send_json(better_ngrok_payload)
    print(f"[Server] Forwarded {request.method} /{full_path}?{query_string} -> worker (id={req_id})")

    try:
        msg = await asyncio.wait_for(future, timeout=60)
    except asyncio.TimeoutError:
        pending_requests.pop(req_id, None)
        return JSONResponse({"error": "Worker timeout"}, status_code=504)
    except Exception as e:
        pending_requests.pop(req_id, None)
        return JSONResponse({"error": str(e)}, status_code=500)

    status_code = msg.get("status_code", 200)
    resp_body = msg.get("body", "")
    resp_headers = msg.get("headers", {})
    media_type = msg.get("media_type", None)

    return Response(
        content=resp_body,
        status_code=status_code,
        headers=resp_headers,
        media_type=media_type,
    )