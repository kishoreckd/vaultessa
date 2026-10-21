import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import UserSession
from .errors import AppError
from .security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    user_id: uuid.UUID
    session_id: uuid.UUID


def get_auth(
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


DbSession = Annotated[Session, Depends(get_db)]
Auth = Annotated[AuthContext, Depends(get_auth)]
