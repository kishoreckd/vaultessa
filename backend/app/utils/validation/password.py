# Handles user authentication including password hashing and verification (e.g., for JWT-based auth).
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hashes a plaintext password using bcrypt.

    Args:
        password (str): The plaintext password to be hashed.

    Returns:
        str: The hashed password.
    """
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a hashed password.

    Args:
        password (str): The plaintext password input by the user.
        hashed_password (str): The hashed password stored in the database.

    Returns:
        bool: True if the password matches, False otherwise.
    """
    return pwd_context.verify(password, hashed_password)


async def authenticate_user(db, email: str, password: str):
    """
    Authenticates a user by email and password.

    Args:
        db: The MongoDB database instance.
        email (str): The user's email address.
        password (str): The plaintext password provided by the user.

    Returns:
        dict or None: Returns the user document if authentication is successful, otherwise None.
    """
    user = await db["users"].find_one({"email": email})
    if user and verify_password(password, user["password"]):
        return user
    return None
