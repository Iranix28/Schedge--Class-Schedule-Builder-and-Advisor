import asyncio
import json
import websockets
import requests
import argparse

SERVER_URL = "ws:///worker"
LOCAL_BASE_URL = "http://localhost:8000"  # Docker/FastAPI LLM endpoint

# ANSI color codes
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

async def main():
    args = parse_args()
    #global SERVER_URL
    #global LOCAL_BASE_URL
    #SERVER_URL = SERVER_URL.format(args.server)
    #LOCAL_BASE_URL = LOCAL_BASE_URL.format(args.local)
    print(f"{YELLOW}Running NGROK:{RESET}")
    print(f"{CYAN}[Worker] Connecting to server at: {SERVER_URL}{RESET}")

    try:
        async with websockets.connect(SERVER_URL) as ws:
            print(f"{GREEN}[Worker] Connected to server{RESET}")
            print(f"{GREEN}[Worker] Forwarding requests to: {LOCAL_BASE_URL}{RESET}\n")
            while True:
                msg = await ws.recv()

                data = json.loads(msg)
                checkDebug(args, msg, "RECEIVED FROM SERVER")

                req_id = data["id"]
                method = data["method"]
                path = data.get("path", "/")
                query = data.get("query", "")
                headers = data.get("headers", {})
                body = data.get("body", "")

                # Build local URL
                url = LOCAL_BASE_URL + path
                if query:
                    url += "?" + query

                print(f"[Worker] Forwarding {method} {url} (id={req_id})\n")

                # Optional: clean headers for local request
                headers.pop("host", None)
                headers.pop("content-length", None)

                try:
                    resp = requests.request(
                        method=method,
                        url=url,
                        headers=headers,
                        data=body.encode("utf-8"),
                        timeout=30,
                    )
                    reply = {
                        "id": req_id,
                        "status_code": resp.status_code,
                        "headers": dict(resp.headers),
                        "body": resp.text,
                        "media_type": resp.headers.get("content-type", "text/plain"),
                    }
                except Exception as e:
                    print(f"[Worker] Error forwarding request: {e}")
                    reply = {
                        "id": req_id,
                        "status_code": 502,
                        "headers": {"content-type": "text/plain"},
                        "body": f"Worker error: {e}",
                        "media_type": "text/plain",
                    }

                reply_json = json.dumps(reply, indent=4, sort_keys=True)

                checkDebug(args, reply_json, "REPLY TO SERVER")

                await ws.send(reply_json)
                print(f"[Worker] Sent result back to server for id={req_id}\n")

    except websockets.exceptions.InvalidHandshake as e:
        print(f"{RED}[Worker] Invalid handshake: {e}{RESET}")
        return

    except OSError as e:
        print(f"{RED}[Worker] Could not reach server: {e}{RESET}")
        return

    except Exception as e:
        print(f"{RED}[Worker] Unexpected error: {e}{RESET}")
        return

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", type=int, default=8000)
    parser.add_argument("--local", type=int, default=5000)
    parser.add_argument("--debug", type=int, default=1)
    return parser.parse_args()


def checkDebug(args, json_data, title):
    if  args.debug == 1:
        content = json.loads(json_data)
        print(f"{BLUE}=== {title} ==={RESET}")
        print(content["body"])
        print(f"{BLUE}============================={RESET}")
    if args.debug == 2:
        content = json.loads(json_data)
        print(f"\n{BLUE}=== {title} ==={RESET}")
        print(json.dumps(content, indent=4, sort_keys=True))
        print(f"{BLUE}============================={RESET}")

asyncio.run(main())
