# 1. Validar tipos de archivos
# 2. Subiendo archivos al servidor
# 3. Generando archivos de despliegue
# 4. Subuendo a produccion el videojuego
# 5. VErificando integridad del despliegue

import shutil
import asyncio
from pathlib import Path
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, AsyncGenerator

from jinja2 import Environment, FileSystemLoader


@dataclass
class Context:
    data: Dict[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self.data[key] = value


class Task(ABC):
    @abstractmethod
    async def execute(self, context: Context) -> None:
        pass


class Pipeline:
    def __init__(self, tasks: list[Task]):
        self.tasks = tasks

    async def run(self, context: Context) -> AsyncGenerator[dict, None]:
        for i, task in enumerate(self.tasks):
            await task.execute(context)
            await asyncio.sleep(0.75)  # Simular tiempo de procesamiento sin bloquear el loop
            payload = {
                "step": i + 1,
                "total": len(self.tasks),
                "label": context.get(f"label_{i + 1}", "Procesando..."),
            }
            print(i)
            if i == len(self.tasks) - 1:
                payload["done"] = True
                payload["result"] = {
                    "message": "Archivos recibidos correctamente",
                    "files": context.get("filesnames", [])
                }
            yield payload


class ValidateFilesTask(Task):
    async def execute(self, context: Context) -> None:
        files = context.get("files")
        allowed_types = context.get("allowed_types")
        if not files or len(files) != 5:
            raise ValueError("Error al validar los archivos")
        for file in files:
            if file.content_type not in allowed_types.values():
                raise ValueError(f"Tipo de archivo no permitido: {file.content_type}")
        context.set("label_1", "Pasooooooo 1 completado")
        context.set("is_valid", True)


class DownloadFilesTask(Task):
    async def execute(self, context: Context) -> None:
        files = context.get("files")
        allowed_types = context.get("allowed_types")
        is_valid = context.get("is_valid")
        if not is_valid:
            raise ValueError("Los archivos no son válidos para descargar")
        
        game_path = context.get("game_path")
        filenames = []
        file_path: Path = None
        for file in files:
            content = await file.read()
            if file.content_type != allowed_types["html"]:
                file_path = game_path / "Build" / file.filename
            else:
                file_path = game_path / file.filename

            with open(file_path, "wb") as f:
                f.write(content)
        
            filenames.append({
                "filename": file.filename,
                "content_type": file.content_type,
            })
        context.set("filesnames", filenames)
        context.set("dir_path", file_path.parent.resolve().as_posix())
        context.set("label_2", "Paso 2 completado")
        context.set("is_downloaded", True)


class GenerateDeployFilesTask(Task):
    async def execute(self, context: Context) -> None:
        is_downloaded = context.get("is_downloaded")
        if not is_downloaded:
            raise ValueError("Los archivos no han sido descargados correctamente")
        else: 
            dir_path: str = context.get("dir_path")
            dir_path = dir_path.split("/Build")[0]
        
        template_path = Path("./api/conf/Dockerfile.jinja2").resolve()
        env = Environment(
            loader=FileSystemLoader(template_path.parent)
        )
        template = env.get_template(template_path.name)
        output = template.render(path=dir_path)
        with open(f"{dir_path}/Dockerfile", "w") as f:
            f.write(output)
        
        nginx_conf_path = template_path.parent / "nginx.conf"
        shutil.copy(nginx_conf_path, f"{dir_path}/nginx.conf")

        context.set("label_3", "Paso 3 completado")
        context.set("is_deploy_generated", True)
