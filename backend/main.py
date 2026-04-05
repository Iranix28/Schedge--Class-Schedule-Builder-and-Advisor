# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
#python -m uvicorn routers.main:app --reload --port 8000
#run command above to run server

from app.routers import ollama_router, departments_router, courses_router, class_sections_router, course_prerequisites_router, audit_requirements_router, schedule_builder_router, auth_router, save_plan_router, course_grade_stats_router
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi import Request

app = FastAPI(
    title="Schedge Backend (Test)",
)

# SessionMiddleware MUST be added before CORSMiddleware
app.add_middleware(
    SessionMiddleware,
    secret_key="change-this-to-a-long-random-secret-in-production",
    same_site="lax",       # "lax" works for localhost; "strict" breaks cross-port cookies
    https_only=False,      # must be False for http://localhost
    max_age=86400,         # session lasts 24 hours (seconds); increase if using remember_me
)

# Allow your browser frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:3000",
        "http://136.36.121.11:8000",
    ],
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

app.include_router(ollama_router.router)
app.include_router(departments_router.router)
app.include_router(courses_router.router)
app.include_router(class_sections_router.router)
app.include_router(course_prerequisites_router.router)
app.include_router(audit_requirements_router.router)
app.include_router(schedule_builder_router.router)
app.include_router(auth_router.router)
app.include_router(save_plan_router.router)
app.include_router(course_grade_stats_router.router)

@app.get("/status", response_model=None, status_code=204)
def status():
    pass