import asyncio
import json
import websockets
import requests

SERVER_URL = "ws://136.59.166.184:8000/worker"  # server websocket
LOCAL_LLM_URL = "http://localhost:8000/ollama/chat"  # Docker/FastAPI LLM endpoint

async def main():
    async with websockets.connect(SERVER_URL) as ws:
        print("[Worker] Connected to server")
        while True:
            # receive prompt from server
            data = await ws.recv()
            prompt = json.loads(data)["prompt"]
            print("[Worker] Received prompt:", prompt)

            # send prompt to local LLM endpoint
            try:
                r = requests.post(LOCAL_LLM_URL, json={"message": prompt})
                r.raise_for_status()
                result = r.json().get("reply", "")
            except Exception as e:
                result = f"Error contacting local LLM: {e}"

            # send result back to server
            await ws.send(json.dumps({"result": result}))
            print("[Worker] Sent result back to server:", result)

asyncio.run(main())
