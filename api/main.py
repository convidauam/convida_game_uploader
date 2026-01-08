from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from api.routers.upload import router as upload_router


app = FastAPI(
    title="Unity Games Uploader",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_class=HTMLResponse)
async def health_check():
    return "<h2>Hello World</h2>"

app.include_router(upload_router, prefix="/api")
