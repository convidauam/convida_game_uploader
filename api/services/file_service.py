from pathlib import Path

from fastapi import UploadFile, HTTPException

ALLOWED_TYPES = {
    "data": "application/octet-stream",
    "js": "text/javascript",
    "wasm": "application/wasm",
    "gzip": "application/gzip",
    "html": "text/html"
}
UPLOAD_DIR = Path("api/uploads")

async def process_files(
        data: UploadFile,
        framework: UploadFile,
        loader: UploadFile,
        wasm: UploadFile,
        html: UploadFile
    ) -> dict:

    filenames = []

    files = [data, framework, loader, wasm, html]
    root_game_path = data.filename.split(".")[0].lower()
    game_path = UPLOAD_DIR / root_game_path
    game_path.joinpath("Build").mkdir(parents=True, exist_ok=True)

    for file in files:
        if file.content_type not in ALLOWED_TYPES.values():
            raise HTTPException(
                status_code=415,
                detail=f"Tipo de archivo no permitido: {file.content_type}"
            )
        
        content = await file.read()
        if file.content_type != ALLOWED_TYPES["html"]:
            file_path = game_path / "Build" / file.filename
        else:
            file_path = game_path / file.filename

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