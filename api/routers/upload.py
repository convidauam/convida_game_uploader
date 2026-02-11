import json

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse

from api.services.file_service import process_files

router = APIRouter(
    prefix="/upload",
    tags=["Upload"]
)


@router.post("/")
async def upload_files(
    files: list[UploadFile] = File(...)
):
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Se deben enviar archivos para procesar"
        )

    async def event_stream():
        try:
            async for payload in process_files(files):
                yield f"data: {json.dumps(payload)}\n\n"
        except HTTPException as error:
            payload = {"error": error.detail, "done": True}
            yield f"data: {json.dumps(payload)}\n\n"
        except Exception:
            payload = {"error": "Error inesperado en el servidor.", "done": True}
            yield f"data: {json.dumps(payload)}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=headers,
    )
