from typing import Annotated, Literal

from pydantic import StringConstraints

from app.core.schema import Email, RequestModel


class EnquiryRequest(RequestModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    email: Email
    category: Literal["general", "teams", "feedback"]
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=4000)]
    contact_consent: Literal[True]
    website: Annotated[str, StringConstraints(max_length=200)] = ""
