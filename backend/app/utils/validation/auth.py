from fastapi import Header, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.database import Database
from app.core.config import settings

# FastAPI's HTTPBearer triggers the Swagger "Authorize" button
security = HTTPBearer(auto_error=False)

async def get_auth_token_from_db(company_name: str) -> str:
    """
    Fetch AUTH_TOKEN from the chatbot.user collection for a specific company.
    """
    config = await Database.get_admin_config(company_name)
    auth_token = config.get("auth_token")

    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AUTH_TOKEN not found in admin config"
        )
    return auth_token


async def verify_auth_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    company_name: str = Header(None)
):
    """
    Verifies Bearer token against the stored company-specific token from DB.
    """
    if not company_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing company_name in the request header."
        )

    expected_token = await get_auth_token_from_db(company_name)
    if not credentials or credentials.scheme != "Bearer" or credentials.credentials != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authorization token."
        )


def verify_ADMIN_TOKEN(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Verifies the Authorization header against a static admin token from settings.
    """
    expected_token = settings.DB_ADMIN_TOKEN

    if not credentials or credentials.scheme != "Bearer" or credentials.credentials != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authorization token."
        )
