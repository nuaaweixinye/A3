"""
知识库微服务入口 —— 讯飞星火知识库

提供：
- POST /api/v1/search      语义检索
- POST /api/v1/fact-check   事实验证
- POST /api/v1/ingest       文档上传
- GET  /api/v1/health       健康检查

启动方式：
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

import logging
from pathlib import Path

# 自动加载 .env 文件（可选）
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_file)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.search import router as search_router
from app.api.fact_check import router as fact_check_router
from app.api.ingest import router as ingest_router
from app.api.stats import router as stats_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Knowledge Service — 星火知识库微服务",
    description="基于讯飞星火知识库 (ChatDoc) 的语义检索与事实验证服务（第十五届软件杯 A3 赛题）",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search_router, prefix="/api/v1")
app.include_router(fact_check_router, prefix="/api/v1")
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(stats_router, prefix="/api/v1")

logger.info("Knowledge service ready (Spark KB mode)")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
