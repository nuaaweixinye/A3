"""知识库微服务入口

FastAPI 应用，提供：
- POST /api/v1/search      语义检索（Chroma + BGE-M3）
- POST /api/v1/fact-check   事实验证（防幻觉第3层）
- POST /api/v1/ingest       文档导入（PDF/PPTX/Markdown）
- GET  /api/v1/stats        知识库统计
- GET  /api/v1/health       健康检查

启动方式：
    uvicorn app.main:app --host 0.0.0.0 --port 8000
    # 或 python -m app.main (开发模式直接运行)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.search import router as search_router
from app.api.ingest import router as ingest_router
from app.api.fact_check import router as fact_check_router
from app.api.stats import router as stats_router

# 日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时预热：加载 BGE-M3 模型 + 连接 Chroma"""
    logger.info("Starting knowledge service...")
    try:
        from app.core.embedding import _get_model
        _get_model()
        logger.info("BGE-M3 embedding model loaded")
    except Exception as e:
        logger.warning(f"Embedding model not preloaded: {e}")

    try:
        from app.services.retriever import _get_collection
        coll = _get_collection()
        logger.info(f"Chroma connected, collection size: {coll.count()}")
    except Exception as e:
        logger.warning(f"Chroma not available at startup: {e}")

    yield
    logger.info("Knowledge service shutting down")


app = FastAPI(
    title="Knowledge Service — 知识库微服务",
    description="基于 Chroma + BGE-M3 的语义检索与事实验证服务（第十五届软件杯 A3 赛题）",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS：允许 Next.js 前端跨域调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(search_router, prefix="/api/v1")
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(fact_check_router, prefix="/api/v1")
app.include_router(stats_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
