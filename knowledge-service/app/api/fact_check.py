"""POST /api/v1/fact-check — 事实验证"""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import FactCheckRequest, FactCheckResponse
from app.services.spark_kb import get_spark_kb

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/fact-check", response_model=FactCheckResponse, tags=["Fact Check"])
async def fact_check(req: FactCheckRequest):
    """对 LLM 生成内容做交叉验证，回查星火知识库"""
    try:
        kb = get_spark_kb()
        result = await kb.fact_check(req.content, req.topic)
        return FactCheckResponse(**result)
    except Exception as e:
        logger.exception("Fact-check failed")
        raise HTTPException(status_code=500, detail=str(e))
