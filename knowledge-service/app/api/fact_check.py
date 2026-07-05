"""POST /api/v1/fact-check — 生成内容事实验证（防幻觉第3层）"""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import FactCheckRequest, FactCheckResponse
from app.services.verifier import verify

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/fact-check", response_model=FactCheckResponse, tags=["Fact Check"])
async def fact_check(req: FactCheckRequest):
    """对 LLM 生成内容做交叉验证

    提取内容中的"可核声明"（含复杂度/数值的事实陈述），
    逐一回查 Chroma 知识库验证是否有佐证，返回可信度评分。
    """
    try:
        result = verify(req.content, req.topic)
        return FactCheckResponse(**result)
    except Exception as e:
        logger.exception("Fact-check failed")
        raise HTTPException(status_code=500, detail=str(e))
