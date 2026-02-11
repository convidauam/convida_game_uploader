import re
from pathlib import Path
from typing import AsyncGenerator

from fastapi import UploadFile

from .pipeline import (
    Context,
    Pipeline,
    ValidateFilesTask,
    DownloadFilesTask,
    GenerateDeployFilesTask,
    BuildImageTask,
    DeployGameTask
)

ALLOWED_TYPES = {
    "data": "application/octet-stream",
    "js": "text/javascript",
    "wasm": "application/wasm",
    "gzip": "application/gzip",
    "html": "text/html"
}
UPLOAD_DIR = Path("api/uploads")


DATA_RE = re.compile(r"\.data(\.(gz|br|unityweb))?$", re.IGNORECASE)


def get_safe_filename(filename: str) -> str:
    return Path(filename.replace("\\", "/")).name


def extract_game_name(filename: str) -> str:
    safe_name = get_safe_filename(filename)
    name = DATA_RE.sub("", safe_name)
    return name.lower() or "game"


def find_required_files(files: list[UploadFile]) -> dict:
    required = {
        "data": DATA_RE,
        "framework": re.compile(r"\.framework(\.js)?(\.(gz|br|unityweb))?$", re.IGNORECASE),
        "loader": re.compile(r"\.loader(\.js)?(\.(gz|br|unityweb))?$", re.IGNORECASE),
        "wasm": re.compile(r"\.wasm(\.(gz|br|unityweb))?$", re.IGNORECASE),
        "html": re.compile(r"index\.html$", re.IGNORECASE),
    }
    matches: dict[str, UploadFile] = {}
    for file in files:
        filename = file.filename or ""
        for key, pattern in required.items():
            if key not in matches and pattern.search(filename):
                matches[key] = file
    return matches


async def process_files(
        files: list[UploadFile]
    ) -> AsyncGenerator[dict, None]:

    required = find_required_files(files)
    data_file = required.get("data")
    root_game_path = extract_game_name(data_file.filename if data_file else "game.data")
    game_path = UPLOAD_DIR / root_game_path

    context = Context()
    context.set("files", files)
    context.set("allowed_types", ALLOWED_TYPES)
    context.set("required_files", required)
    context.set("game_name", root_game_path)
    context.set("game_path", game_path)

    steps = [
        ValidateFilesTask(),
        DownloadFilesTask(),
        GenerateDeployFilesTask(),
        BuildImageTask(),
        DeployGameTask()
    ]

    pipeline = Pipeline(steps)

    async for payload in pipeline.run(context):
        yield payload
