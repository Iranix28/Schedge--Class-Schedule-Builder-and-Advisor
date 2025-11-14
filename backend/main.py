# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
#python -m uvicorn routers.main:app --reload --port 8000
#run command above to run server

from app.routers import ollama_router, departments_router
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi import Request

app = FastAPI(
    title="Schedge Backend (Test)",
)

# Allow your browser frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # in production restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exception: HTTPException):
    return JSONResponse(
        status_code=exception.status_code,
        content=jsonable_encoder(exception.detail)  
    )

app.include_router(ollama_router.router)        #add any more routers here first or it wont work, update the import line first though(line 7)
app.include_router(departments_router.router)

@app.get("/status", response_model=None, status_code=204)       #testing bruv
def status():
    pass