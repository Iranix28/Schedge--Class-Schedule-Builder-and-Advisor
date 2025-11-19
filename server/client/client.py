import asyncio
import json
import websockets
import subprocess
# (to run client)

SERVER_URL = "ws://A_PUBLIC_IP:8080/worker"
MODEL = "deepseek-r1:8b"  # <--- Your Ollama model name

def run_llm(prompt: str):
    # DeepSeek R1 typically returns streaming tokens.
    # We just capture the normal output.
    result = subprocess.run(
        ["ollama", "run", MODEL, prompt],
        capture_output=True,
        text=True
    )
    return result.stdout.strip()

async def main():
    async with websockets.connect(SERVER_URL) as ws:
        print("Connected to Person A")

        while True:
            message = await ws.recv()
            data = json.loads(message)

            job_id = data["job_id"]
            prompt = data["prompt"]
            print(f"Received job: {job_id}")

            response = run_llm(prompt)

            await ws.send(json.dumps({
                "job_id": job_id,
                "result": response
            }))

asyncio.run(main())