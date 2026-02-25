from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Annotated
from fastapi import Depends
from app.config.env_variables import DATABASE_URL


engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,  # detects & discards connections stuck in aborted transactions
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


def get_session():
    """FastAPI dependency that provides a fresh DB session."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()  # clean up aborted transaction before returning to pool
        raise
    finally:
        db.close()


DBSession = Annotated[Session, Depends(get_session)]