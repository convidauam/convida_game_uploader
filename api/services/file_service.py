from typing import List
from pathlib import Path

from fastapi import UploadFile, HTTPException

ALLOWED_TYPES = {"application/wasm", "text/html", "application/javascript", "application/gzip", "application/octet-stream"}
UPLOAD_DIR = Path("api/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

async def process_files(files: List[UploadFile]) -> dict:
    filenames = []

    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Tipo de archivo no permitido: {file.content_type}"
            )
        content = await file.read()
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as f:
            f.write(content)
    
        filenames.append({
            "filename": file.filename,
            "content_type": file.content_type,
        })

    return {
        "message": "Archivos recibidos correctamente",
        "files": filenames
    }