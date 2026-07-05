"""BGE-M3 Embedding 封装 —— 中英双语向量化

初始化开销较大（首次加载模型约 2-5 秒），使用模块级单例避免重复加载。
"""

import logging
from typing import List

from sentence_transformers import SentenceTransformer

from app.core.config import EMBEDDING_MODEL_NAME, EMBEDDING_DEVICE

logger = logging.getLogger(__name__)

# 模块级单例
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """懒加载 BGE-M3 模型（线程安全由 SentenceTransformer 自身保证）"""
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL_NAME} on {EMBEDDING_DEVICE}")
        _model = SentenceTransformer(
            EMBEDDING_MODEL_NAME,
            device=EMBEDDING_DEVICE,
        )
        # BGE-M3 输出 1024 维向量；对查询使用 instruction prefix 可稍提升检索质量
        logger.info(f"Embedding model loaded. dim={_model.get_sentence_embedding_dimension()}")
    return _model


def embed_query(query: str) -> List[float]:
    """将查询文本向量化（BGE-M3 查询模式）"""
    model = _get_model()
    # BGE-M3 推荐：对 query 侧不做 instruction（或使用 "Represent this sentence for searching relevant passages: "）
    embedding = model.encode(query, normalize_embeddings=True)
    return embedding.tolist()


def embed_documents(texts: List[str]) -> List[List[float]]:
    """将文档文本批量向量化"""
    model = _get_model()
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return embeddings.tolist()
