from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.logging import logger
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    refresh_token_expiry,
    verify_password,
    verify_refresh_token,
)
from app.deps import get_current_user, get_db
from app.models import RefreshToken, User
from app.schemas import RefreshRequest, Token, UserCreate, UserLogin, UserRead


router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user: User, db: Session) -> Token:
    access_token = create_access_token(str(user.id))
    raw_refresh, hashed_refresh = generate_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hashed_refresh,
        expires_at=refresh_token_expiry(),
    ))
    db.commit()
    return Token(access_token=access_token, refresh_token=raw_refresh)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        logger.warning("login_failed", email=payload.email)
        raise HTTPException(status_code=400, detail="Invalid credentials")
    logger.info("login_success", user_id=user.id, role=user.role.value)
    return _issue_tokens(user, db)


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
def refresh(request: Request, payload: RefreshRequest, db: Session = Depends(get_db)) -> Token:
    now = datetime.now(timezone.utc)
    candidates = db.scalars(
        select(RefreshToken).where(
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > now,
        )
    ).all()

    matched: RefreshToken | None = None
    for candidate in candidates:
        if verify_refresh_token(payload.refresh_token, candidate.token_hash):
            matched = candidate
            break

    if not matched:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    matched.revoked = True
    db.flush()

    user = db.get(User, matched.user_id)
    return _issue_tokens(user, db)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)) -> None:
    now = datetime.now(timezone.utc)
    candidates = db.scalars(
        select(RefreshToken).where(
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > now,
        )
    ).all()

    for candidate in candidates:
        if verify_refresh_token(payload.refresh_token, candidate.token_hash):
            candidate.revoked = True
            db.commit()
            return


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
