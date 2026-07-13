"""POST /api/v1/search — 星火知识库语义检索"""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import SearchRequest, SearchResponse
from app.services.spark_kb import get_spark_kb

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search", response_model=SearchResponse, tags=["Search"])
async def semantic_search(req: SearchRequest):
    """通过讯飞星火知识库做语义检索，返回最相关的文档片段"""
    try:
        kb = get_spark_kb()
        results = await kb.search(req.query, req.top_k)
        return SearchResponse(results=results)
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=str(e))
