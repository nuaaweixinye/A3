"""POST /api/v1/search — 语义检索"""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import SearchRequest, SearchResponse
from app.services.retriever import search as search_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search", response_model=SearchResponse, tags=["Search"])
async def semantic_search(req: SearchRequest):
    """基于 BGE-M3 + Chroma 的语义相似度检索

    将查询文本向量化后，在 Chroma 向量库中检索 top_k 条最相似的文档块，
    返回带相似度得分的排序结果。
    """
    try:
        results = search_service(req.query, req.top_k)
        return SearchResponse(results=results)
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=str(e))
