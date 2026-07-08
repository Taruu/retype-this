from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import create_access_token, get_config, verify_password
from app.config import AppConfig
from app.schemas.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, config: AppConfig = Depends(get_config)) -> TokenResponse:
    username = body.username.strip()
    password = body.password
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if username != config.auth.username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(password, config.auth.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(username, config.server.secret_key)
    return TokenResponse(access_token=token)
