from fastapi import APIRouter, Request

from app.core.deps import DbSession
from app.schemas.enquiries import EnquiryRequest
from app.services.enquiry_service import save_enquiry

router = APIRouter(tags=["enquiries"])


@router.post("/enquiries", status_code=202)
def submit_enquiry(body: EnquiryRequest, request: Request, db: DbSession):
    # Do not trust arbitrary forwarded headers as a way to bypass the rate limit.
    save_enquiry(db, body, request.client.host if request.client else "unknown")
    return {"message": "Thank you. Your enquiry has been received."}
