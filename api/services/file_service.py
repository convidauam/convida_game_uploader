from pathlib import Path
from typing import AsyncGenerator

from fastapi import UploadFile, HTTPException

from .pipeline import (
    Context,
    Pipeline,
    ValidateFilesTask,
    DownloadFilesTask,
    GenerateDeployFilesTask
)

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
    ) -> AsyncGenerator[dict, None]:

    files = [data, framework, loader, wasm, html]
    root_game_path = data.filename.split(".")[0].lower()
    game_path = UPLOAD_DIR / root_game_path
    game_path.joinpath("Build").mkdir(parents=True, exist_ok=True)

    context = Context()
    context.set("files", files)
    context.set("allowed_types", ALLOWED_TYPES)
    context.set("game_path", game_path)

    steps = [
        ValidateFilesTask(),
        DownloadFilesTask(),
        GenerateDeployFilesTask()
    ]

    pipeline = Pipeline(steps)

    async for payload in pipeline.run(context):
        yield payload
