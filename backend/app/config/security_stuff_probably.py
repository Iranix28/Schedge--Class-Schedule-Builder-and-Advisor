import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from jose import jwt, JWTError
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

SESSION_COOKIE_NAME = "schedge_session"
SESSION_ALG = "HS256"
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-only-change-me")  # change in .env for real

def hash_password(password: str) -> str:
    if password is None:
        raise ValueError("Password missing")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password too long (max 72 bytes for bcrypt)")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_session_token(*, user_id: int, username: str, role: str, minutes: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm=SESSION_ALG)

def decode_session_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=[SESSION_ALG])
    except JWTError:
        return None
