from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database.session import DBSession
from app.database.schema import User
from app.config.security_stuff_probably import SESSION_COOKIE_NAME, decode_session_token

def get_current_user(request: Request, db: DBSession) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_session_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user
