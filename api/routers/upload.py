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

    async def event_stream():
        try:
            async for payload in process_files(
                data, framework, loader, wasm, html
            ):
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
