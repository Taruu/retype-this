from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import create_access_token, get_config, verify_password
from app.config import AppConfig
from app.schemas.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, config: AppConfig = Depends(get_config)) -> TokenResponse:
    if body.username != config.auth.username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(body.password, config.auth.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(body.username, config.server.secret_key)
    return TokenResponse(access_token=token)
