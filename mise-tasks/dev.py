#!/usr/bin/env -S uv run --script
#MISE description="Start the development environment for this project"
# /// script
# dependencies = ["rich"]
# ///
import os
import signal
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.status import Status

console = Console()

PROJECT_ROOT = Path(__file__).parents[1].resolve()
FRONTEND_PORT = 3000
BACKEND_PORT = 8000
FRONTEND_CMD = ["npm", "run", "dev"]
BACKEND_CMD = [
    "uv",
    "run",
    "uvicorn",
    "api.main:app",
    "--reload",
    "--host",
    "0.0.0.0",
    "--port",
    str(BACKEND_PORT),
]
LOG_BUFFER_LINES = 200
LOG_PANEL_LINES = 30


class ProcessManager:
    def __init__(self) -> None:
        self.processes: Dict[str, subprocess.Popen] = {}
        self.logs: Dict[str, Deque[str]] = {
            "frontend": deque(maxlen=LOG_BUFFER_LINES),
            "backend": deque(maxlen=LOG_BUFFER_LINES),
        }

    def start_process(
        self,
        name: str,
        cmd: List[str],
        cwd: Optional[Path] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> bool:
        try:
            console.print(
                f"[dim]Starting {name}: {' '.join(cmd)} (cwd: {cwd or PROJECT_ROOT})[/dim]"
            )
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=str(cwd or PROJECT_ROOT),
                env=env,
            )
            self.processes[name] = process

            thread = threading.Thread(
                target=self._capture_output,
                args=(name, process),
                daemon=True,
            )
            thread.start()
            return True
        except Exception as e:
            console.print(f"[red]Failed to start {name}: {e}[/red]")
            return False

    def _capture_output(self, name: str, process: subprocess.Popen) -> None:
        stdout = process.stdout
        assert stdout is not None
        for line in iter(stdout.readline, ""):
            if line:
                self.logs[name].append(line.rstrip())
            if process.poll() is not None:
                break

    def stop_all(self) -> None:
        for process in self.processes.values():
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            except Exception:
                pass

    def is_running(self) -> bool:
        return any(process.poll() is None for process in self.processes.values())

    def get_status(self) -> Dict[str, str]:
        status: Dict[str, str] = {}
        for name, process in self.processes.items():
            if process.poll() is None:
                status[name] = "🟢 Running"
            else:
                status[name] = f"🔴 Stopped (exit code: {process.poll()})"
        return status


def ensure_project_layout() -> None:
    required = [
        PROJECT_ROOT / "package.json",
        PROJECT_ROOT / "api" / "main.py",
    ]
    missing = [path for path in required if not path.exists()]
    if missing:
        missing_list = "\n".join(f"- {path}" for path in missing)
        console.print("[red]This script is tied to this repository layout.[/red]")
        console.print(f"[red]Missing required files:\n{missing_list}[/red]")
        sys.exit(1)


def create_live_dashboard() -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="body"),
        Layout(name="footer", size=3),
    )
    layout["body"].split_row(
        Layout(name="frontend"),
        Layout(name="backend"),
    )
    return layout


def update_dashboard(layout: Layout, manager: ProcessManager) -> None:
    status = manager.get_status()

    frontend_logs = "\n".join(list(manager.logs["frontend"])[-LOG_PANEL_LINES:])
    backend_logs = "\n".join(list(manager.logs["backend"])[-LOG_PANEL_LINES:])

    frontend_status = status.get("frontend", "🔴 Not started")
    backend_status = status.get("backend", "🔴 Not started")

    layout["header"].update(
        Panel(
            "[bold blue]🚀 Development Environment[/bold blue]\n"
            "[dim]Press Ctrl+C to stop all services[/dim]",
            border_style="blue",
        )
    )

    layout["frontend"].update(
        Panel(
            f"[bold]Status:[/bold] {frontend_status}\n\n"
            f"[dim]Recent output:[/dim]\n{frontend_logs}",
            title="🎨 Frontend (npm)",
            border_style="green" if "Running" in frontend_status else "red",
        )
    )

    layout["backend"].update(
        Panel(
            f"[bold]Status:[/bold] {backend_status}\n\n"
            f"[dim]Recent output:[/dim]\n{backend_logs}",
            title="🔧 Backend (uvicorn)",
            border_style="green" if "Running" in backend_status else "red",
        )
    )

    layout["footer"].update(
        Panel(
            f"[bold]Frontend:[/bold] http://localhost:{FRONTEND_PORT} | "
            f"[bold]Backend:[/bold] http://localhost:{BACKEND_PORT}",
            border_style="blue",
        )
    )


def start_development_environment() -> bool:
    manager = ProcessManager()

    def signal_handler(sig, frame) -> None:
        console.print("\n[yellow]Shutting down development environment...[/yellow]")
        manager.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    ensure_project_layout()

    config_panel = Panel.fit(
        f"[bold]Frontend:[/bold] {' '.join(FRONTEND_CMD)}\n"
        f"[bold]Backend:[/bold] {' '.join(BACKEND_CMD)}\n"
        f"[bold]Frontend URL:[/bold] http://localhost:{FRONTEND_PORT}\n"
        f"[bold]Backend URL:[/bold] http://localhost:{BACKEND_PORT}",
        title="🚀 Development Configuration",
        border_style="green",
    )
    console.print(config_panel)

    console.print("\n[bold]Starting development servers...[/bold]")

    with Status("Starting frontend server...", spinner="dots"):
        if not manager.start_process("frontend", FRONTEND_CMD, PROJECT_ROOT):
            console.print("[red]Failed to start frontend[/red]")
            return False
        time.sleep(2)

    backend_env = os.environ.copy()
    backend_env.pop("VIRTUAL_ENV", None)
    with Status("Starting backend server...", spinner="dots"):
        if not manager.start_process(
            "backend",
            BACKEND_CMD,
            PROJECT_ROOT,
            env=backend_env,
        ):
            console.print("[red]Failed to start backend[/red]")
            return False
        time.sleep(2)

    layout = create_live_dashboard()

    with Live(layout, refresh_per_second=4, screen=True):
        try:
            while manager.is_running():
                update_dashboard(layout, manager)
                time.sleep(0.25)
        except KeyboardInterrupt:
            pass

    console.print("\n[yellow]Stopping all services...[/yellow]")
    manager.stop_all()
    console.print("[green]✅ Development environment stopped.[/green]")
    return True


def main() -> None:
    success = start_development_environment()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Operation cancelled by user.[/yellow]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Unexpected error: {e}[/red]")
        sys.exit(1)
