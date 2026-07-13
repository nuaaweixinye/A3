"""POST /api/v1/ingest — 文档上传到星火知识库"""

import logging
import tempfile
import os
from typing import List, Optional
from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.models.schemas import IngestResponse
from app.services.spark_kb import get_spark_kb

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse, tags=["Ingest"])
async def ingest_documents(
    files: Optional[List[UploadFile]] = File(None),
):
    """上传文档到星火知识库，支持逐文件上传"""
    if not files:
        raise HTTPException(status_code=400, detail="请上传至少一个文件")

    kb = get_spark_kb()
    total = 0
    sources = []
    errors = []

    for file in files:
        suffix = os.path.splitext(file.filename or "upload")[1] or ".md"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        try:
            info = await kb.upload_file(tmp_path)
            file_id = info.get("fileId", "")
            sources.append(file.filename or "")
            total += 1
            logger.info(f"Uploaded {file.filename} -> {file_id}")
        except Exception as e:
            errors.append(f"{file.filename}: {str(e)}")
        finally:
            os.unlink(tmp_path)

    return IngestResponse(ingested=total, sources=sources, errors=errors)
