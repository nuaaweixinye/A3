"""Pydantic 请求/响应模型 —— 知识库服务 API 合约"""

from pydantic import BaseModel, Field
from typing import List, Optional


# ─── Search ────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., description="检索查询文本", min_length=1)
    top_k: int = Field(default=5, description="返回结果数量", ge=1, le=50)


class SearchResultItem(BaseModel):
    id: str = Field(..., description="Chunk 唯一标识")
    text: str = Field(..., description="Chunk 文本内容")
    source: str = Field(..., description="来源文档名（不含扩展名）")
    score: float = Field(..., description="余弦相似度得分 0~1")


class SearchResponse(BaseModel):
    results: List[SearchResultItem] = Field(default_factory=list)


# ─── Fact Check ────────────────────────────────────────

class FactCheckRequest(BaseModel):
    content: str = Field(..., description="待核查的生成内容（Markdown）", min_length=1)
    topic: str = Field(default="", description="主题词用于辅助检索")


class FactCheckResponse(BaseModel):
    score: int = Field(..., description="有知识库佐证的可核声明占比 0~100")
    flagged: List[str] = Field(default_factory=list, description="未找到佐证的声明摘要")
    checked: int = Field(default=0, description="可核声明总数")


# ─── Ingest ────────────────────────────────────────────

class IngestResponse(BaseModel):
    ingested: int = Field(default=0, description="成功导入的 chunk 数量")
    sources: List[str] = Field(default_factory=list, description="导入的来源文档名")
    errors: List[str] = Field(default_factory=list, description="导入失败的文件及原因")


# ─── Stats ─────────────────────────────────────────────

class StatsResponse(BaseModel):
    total_chunks: int = Field(default=0)
    sources: List[str] = Field(default_factory=list)
    last_ingested: Optional[str] = Field(default=None)


# ─── Health ────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    vector_count: int = 0
    embedding_model: str = ""
