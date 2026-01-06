from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

from api.services.file_service import process_files

router = APIRouter(
    prefix="/upload",
    tags=["Upload"]
)


@router.post("/")
async def upload_files(
    files: List[UploadFile] = File(...)
):
    if len(files) != 5:
        raise HTTPException(
            status_code=400,
            detail="Se deben enviar exactamente 5 archivos"
        )

    return await process_files(files)