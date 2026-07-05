"""GET /api/v1/stats + GET /api/v1/health — 知识库状态"""

import logging
from fastapi import APIRouter

from app.models.schemas import StatsResponse, HealthResponse
from app.services.retriever import get_collection_stats
from app.core.config import EMBEDDING_MODEL_NAME

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/stats", response_model=StatsResponse, tags=["Stats"])
async def stats():
    """返回知识库统计信息：chunk 总数、来源列表、最后更新时间"""
    try:
        s = get_collection_stats()
        return StatsResponse(
            total_chunks=s["total_chunks"],
            sources=s["sources"],
            last_ingested=None,  # TODO: track via metadata
        )
    except Exception as e:
        logger.exception("Stats failed")
        return StatsResponse(total_chunks=0, sources=[], last_ingested=None)


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """健康检查：验证 Chroma 连接 + Embedding 模型状态"""
    try:
        s = get_collection_stats()
        return HealthResponse(
            status="healthy",
            vector_count=s["total_chunks"],
            embedding_model=EMBEDDING_MODEL_NAME,
        )
    except Exception as e:
        logger.warning(f"Health check degraded: {e}")
        return HealthResponse(
            status="degraded",
            vector_count=0,
            embedding_model=EMBEDDING_MODEL_NAME,
        )
