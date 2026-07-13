"""GET /api/v1/health — 健康检查"""

import logging
from fastapi import APIRouter

from app.models.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    """健康检查"""
    return HealthResponse(
        status="healthy",
        vector_count=0,
        embedding_model="星火知识库 (ChatDoc)",
    )
