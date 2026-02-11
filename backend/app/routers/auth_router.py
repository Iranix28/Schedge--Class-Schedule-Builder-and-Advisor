from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.database.session import DBSession
from app.database.schema import User
from app.config.security_stuff_probably import (SESSION_COOKIE_NAME, create_session_token, hash_password, verify_password)
from app.config.deps import get_current_user
from app.models.models import RegisterIn, LoginIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserOut)
def register(payload: RegisterIn, db: DBSession):

    username = (payload.username or "").strip()
    password = payload.password or ""  

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")


    pw_len = len(password.encode("utf-8"))
    if pw_len > 2000:  
        raise HTTPException(status_code=400, detail=f"Password payload too large ({pw_len} bytes)")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    try:
        pw_hash = hash_password(password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user = User(
        username=username,
        password_hash=pw_hash,
        role="student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user



@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: DBSession):
    username = payload.username.strip()
    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # cookie lifetime
    minutes = 60 * 24 * 14 if payload.remember_me else 60 * 8  # 14 days vs 8 hours

    token = create_session_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
        minutes=minutes,
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,       # set True in prod on https
        max_age=minutes * 60,
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
