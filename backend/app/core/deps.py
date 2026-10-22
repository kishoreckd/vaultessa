import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.models.session_model import UserSession
from app.db.models.user_model import User
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    user_id: uuid.UUID
    session_id: uuid.UUID


def get_session_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    """Verifies the access token AND that its session still exists, so logout/revocation is immediate."""
    if credentials is None:
        raise AppError.unauthorized()
    try:
        user_id, session_id = decode_access_token(credentials.credentials)
    except (jwt.PyJWTError, ValueError):
        raise AppError.unauthorized() from None

    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user_id or session.expires_at < datetime.now(UTC):
        raise AppError.unauthorized("Session expired")
    return AuthContext(user_id=user_id, session_id=session_id)


def get_auth(auth: AuthContext = Depends(get_session_auth), db: Session = Depends(get_db)) -> AuthContext:
    user = db.get(User, auth.user_id)
    if not user or not user.email_verified:
        raise AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address before opening your vault")
    return auth


DbSession = Annotated[Session, Depends(get_db)]
Auth = Annotated[AuthContext, Depends(get_auth)]
SessionAuth = Annotated[AuthContext, Depends(get_session_auth)]
