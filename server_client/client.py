import asyncio
import json
import websockets
import requests  # Use requests to call the Docker LLM server

# WebSocket URL to Person A
SERVER_URL = "ws://136.59.160.8:8000/worker"
# Local Docker LLM endpoint
LOCAL_LLM_URL = "http://127.0.0.1:5000/chat"

async def main():
    while True:
        try:
            async with websockets.connect(SERVER_URL) as ws:
                print("Connected to Person A")

                while True:
                    # Receive a job from Person A
                    message = await ws.recv()
                    data = json.loads(message)
                    job_id = data["job_id"]
                    prompt = data["prompt"]
                    print(f"Received job: {job_id}")

                    # Send prompt to local Docker LLM
                    try:
                        response = requests.post(
                            LOCAL_LLM_URL,
                            json={"prompt": prompt},
                            timeout=60
                        )
                        response.raise_for_status()
                        llm_result = response.json().get("response", "")
                    except Exception as e:
                        llm_result = f"Error contacting local LLM: {e}"

                    # Send the result back to Person A
                    await ws.send(json.dumps({
                        "job_id": job_id,
                        "result": llm_result
                    }))

        except Exception as e:
            print("Connection failed, retrying in 5s...", e)
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())