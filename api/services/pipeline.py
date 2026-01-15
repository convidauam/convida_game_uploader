import shutil
import asyncio
import threading
import subprocess
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
            await asyncio.sleep(1)  # Simular tiempo de procesamiento sin bloquear el loop
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
        context.set("label_1", "Validación de archivos")
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
        context.set("dir_path", file_path.parent.as_posix())
        context.set("label_2", "Descarga de archivos")
        context.set("is_downloaded", True)


class GenerateDeployFilesTask(Task):
    async def execute(self, context: Context) -> None:
        is_downloaded = context.get("is_downloaded")
        if not is_downloaded:
            raise ValueError("Los archivos no han sido descargados correctamente")
        
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

        context.set("label_3", "Generación de archivos")
        context.set("is_deploy_generated", True)
            

class BuildImageTask(Task):
    async def execute(self, context: Context) -> None:
        is_deploy_generated = context.get("is_deploy_generated")
        if not is_deploy_generated:
            raise ValueError("Los archivos de despliegue no han sido generados correctamente")
        
        game_name: str = context.get("game_name")
        game_path: Path = context.get("game_path")
        game_path = game_path.joinpath("Dockerfile").as_posix()
        project_root = Path(__file__).parents[2].resolve()

        cmd = [
            "docker",
            "build",
            "-t",
            game_name,
            "-f",
            game_path,
            "."
        ]

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=project_root,
            )

            thread = threading.Thread(
                target=check_output,
                args=(process,),
            )

            thread.start()
            process.wait()
            thread.join()
        except Exception as e:
            raise ValueError(f"Error al construir la imagen Docker: {str(e)}")
        
        context.set("label_4", "Construcción de imagen")
        context.set("is_image_built", True)


class DeployGameTask(Task):
    async def execute(self, context: Context) -> None:
        is_image_built = context.get("is_image_built")
        if not is_image_built:
            raise ValueError("La imagen Docker no ha sido construida correctamente")
        
        game_name: str = context.get("game_name")
        cmd = [
            "docker",
            "run",
            "--name",
            f"{game_name}-local",
            "--rm",
            "-d",
            "-p",
            "8080:80",
            game_name,
        ]

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )

            thread = threading.Thread(
                target=check_output,
                args=(process,),
            )

            thread.start()
            process.wait()
            thread.join()
        except Exception as e:
            raise ValueError(f"Error al desplegar el videojuego: {str(e)}")
        
        context.set("label_5", "Despliegue del videojuego")
        context.set("is_deployed", True)


def check_output(process: subprocess.Popen) -> None:
    for line in process.stdout:
        if line.find("ERROR") != -1 or line.find("Error") != -1:
            raise ValueError("Error con Docker")
