"""Chroma 向量检索服务

提供基于 BGE-M3 + Chroma 的语义相似度检索。
初始化时自动连接 Chroma 持久化存储；若 collection 不存在则创建。
"""

import logging
from typing import List

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, DEFAULT_TOP_K
from app.core.embedding import embed_query
from app.models.schemas import SearchResultItem

logger = logging.getLogger(__name__)

# 模块级单例
_client: chromadb.PersistentClient | None = None
_collection: chromadb.Collection | None = None


def _get_collection() -> chromadb.Collection:
    """懒加载 Chroma collection"""
    global _client, _collection
    if _collection is None:
        logger.info(f"Connecting to Chroma at {CHROMA_PERSIST_DIR}")
        _client = chromadb.PersistentClient(
            path=CHROMA_PERSIST_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"Chroma collection '{CHROMA_COLLECTION_NAME}' ready, count={_collection.count()}")
    return _collection


def search(query: str, top_k: int = DEFAULT_TOP_K) -> List[SearchResultItem]:
    """语义检索：查询向量化 → Chroma similarity_search → 格式化返回

    Args:
        query: 检索查询文本
        top_k: 返回结果数量

    Returns:
        按相似度降序排列的检索结果
    """
    coll = _get_collection()

    if coll.count() == 0:
        logger.warning("Chroma collection is empty — no documents indexed yet")
        return []

    query_embedding = embed_query(query)

    results = coll.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, coll.count()),
        include=["documents", "metadatas", "distances"],
    )

    items: List[SearchResultItem] = []
    if results["ids"] and results["ids"][0]:
        for i, chunk_id in enumerate(results["ids"][0]):
            text = results["documents"][0][i] if results["documents"] else ""
            metadata = results["metadatas"][0][i] if results["metadatas"] else {}
            distance = results["distances"][0][i] if results["distances"] else 1.0
            # Chroma cosine distance → similarity score (0-1)
            score = round(1.0 - distance, 4)

            items.append(SearchResultItem(
                id=chunk_id,
                text=text,
                source=metadata.get("source", "unknown"),
                score=score,
            ))

    return items


def get_collection_stats() -> dict:
    """获取 collection 统计信息"""
    coll = _get_collection()
    count = coll.count()
    sources: List[str] = []
    if count > 0:
        # 从 metadata 中提取所有唯一 source
        all_meta = coll.get(include=["metadatas"])
        if all_meta["metadatas"]:
            sources = sorted(set(
                m.get("source", "unknown") for m in all_meta["metadatas"] if m
            ))
    return {"total_chunks": count, "sources": sources}


def reset_collection():
    """删除并重建 collection（用于重新导入）"""
    global _client, _collection
    if _client:
        try:
            _client.delete_collection(CHROMA_COLLECTION_NAME)
            logger.info(f"Deleted collection '{CHROMA_COLLECTION_NAME}'")
        except Exception:
            pass
    _collection = None
    _ = _get_collection()  # 触发重建
    logger.info(f"Collection '{CHROMA_COLLECTION_NAME}' reset")
