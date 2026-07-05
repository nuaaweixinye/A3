"""POST /api/v1/ingest — 文档导入"""

import logging
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from typing import List, Optional
import tempfile
import os

from app.models.schemas import IngestResponse
from app.services.ingester import ingest_file, ingest_directory
from app.services.retriever import get_collection_stats
from app.core.config import KNOWLEDGE_BASE_DIR

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse, tags=["Ingest"])
async def ingest_documents(
    files: Optional[List[UploadFile]] = File(None),
    clear_first: bool = Form(False),
):
    """上传文档或重索引知识库目录

    - 若上传文件：逐个解析、分块、向量化后写入 Chroma
    - 若未上传文件：默认扫描 KNOWLEDGE_BASE_DIR 目录进行全量导入
    - clear_first=True：导入前清空已有向量数据
    """
    try:
        if files:
            # 上传模式：逐个处理上传的文件
            total = 0
            sources = []
            errors = []
            if clear_first:
                from app.services.retriever import reset_collection
                reset_collection()

            for file in files:
                # 保存到临时文件
                suffix = os.path.splitext(file.filename or "upload")[1] or ".md"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(await file.read())
                    tmp_path = tmp.name

                try:
                    count, source, error = ingest_file(tmp_path)
                    total += count
                    if source:
                        sources.append(source)
                    if error:
                        errors.append(f"{file.filename}: {error}")
                finally:
                    os.unlink(tmp_path)

            return IngestResponse(ingested=total, sources=sources, errors=errors)
        else:
            # 目录模式：扫描 knowledge_base/
            result = ingest_directory(KNOWLEDGE_BASE_DIR, clear_first=clear_first)
            return IngestResponse(**result)

    except Exception as e:
        logger.exception("Ingest failed")
        raise HTTPException(status_code=500, detail=str(e))
