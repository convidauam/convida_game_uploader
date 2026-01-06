from fastapi import FastAPI

from api.routers.upload import router as upload_router

app = FastAPI(
    title="File Upload API",
    version="1.0.0"
)

app.include_router(upload_router, prefix="/api")
