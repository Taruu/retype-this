from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import AppConfig, load_config

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7

security = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def verify_password(plain: str, password_hash: str) -> bool:
    expected = password_hash.removeprefix("sha256:")
    actual = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    return actual == expected


def create_access_token(subject: str, secret_key: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def decode_token(token: str, secret_key: str) -> str:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    return subject


def get_config() -> AppConfig:
    return load_config()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    config: AppConfig = Depends(get_config),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    username = decode_token(credentials.credentials, config.server.secret_key)
    if username != config.auth.username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user",
        )
    return username
