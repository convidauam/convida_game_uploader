from fastapi import APIRouter, UploadFile, File, HTTPException

from api.services.file_service import process_files

router = APIRouter(
    prefix="/upload",
    tags=["Upload"]
)


@router.post("/")
async def upload_files(
    data: UploadFile = File(...),
    framework: UploadFile = File(...),
    loader: UploadFile = File(...),
    wasm: UploadFile = File(...),
    html: UploadFile = File(...)
):
    files = [data, framework, loader, wasm, html]
    if len(files) != 5:
        raise HTTPException(
            status_code=400,
            detail="Se deben enviar exactamente 5 archivos"
        )

    return await process_files(data, framework, loader, wasm, html)