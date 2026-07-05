"""文档导入管道

将 PDF / PPTX / Markdown 文件解析 → 分块 → 向量化 → 写入 Chroma。
支持单文件、批量文件和目录导入。
"""

import logging
import os
from pathlib import Path
from typing import List, Tuple

from app.core.chunking import split_text
from app.core.embedding import embed_documents
from app.services.retriever import _get_collection, reset_collection

logger = logging.getLogger(__name__)

# Chroma 批量写入的 batch size
BATCH_SIZE = 100


def _read_file(file_path: str) -> str | None:
    """根据扩展名选择解析器读取文件全文"""
    ext = Path(file_path).suffix.lower()

    if ext == ".md":
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    if ext == ".pdf":
        try:
            import fitz  # pymupdf
            doc = fitz.open(file_path)
            text = "\n\n".join(page.get_text() for page in doc)
            doc.close()
            return text if text.strip() else None
        except ImportError:
            logger.warning("PyMuPDF (fitz) not installed — can't parse PDF, skipping")
            return None
        except Exception as e:
            logger.error(f"PDF parse error {file_path}: {e}")
            return None

    if ext in (".pptx", ".ppt"):
        try:
            from unstructured.partition.pptx import partition_pptx
            elements = partition_pptx(filename=file_path)
            return "\n\n".join(str(el) for el in elements)
        except ImportError:
            logger.warning("unstructured not installed — can't parse PPTX, skipping")
            return None
        except Exception as e:
            logger.error(f"PPTX parse error {file_path}: {e}")
            return None

    logger.warning(f"Unsupported file type: {ext} ({file_path}), skipping")
    return None


def _source_name(file_path: str) -> str:
    """从文件路径提取来源名（不含扩展名）"""
    return Path(file_path).stem


def _batch_add_to_chroma(texts: List[str], metadatas: List[dict], ids: List[str]):
    """将 chunk 批量写入 Chroma（先 embed 再 add）"""
    if not texts:
        return
    coll = _get_collection()

    # 分批处理，避免过量内存
    for i in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[i:i + BATCH_SIZE]
        batch_metas = metadatas[i:i + BATCH_SIZE]
        batch_ids = ids[i:i + BATCH_SIZE]

        embeddings = embed_documents(batch_texts)
        coll.add(
            ids=batch_ids,
            embeddings=embeddings,
            documents=batch_texts,
            metadatas=batch_metas,
        )
        logger.debug(f"  Added batch {i // BATCH_SIZE + 1}: {len(batch_texts)} chunks")


def ingest_file(file_path: str) -> Tuple[int, str, str | None]:
    """导入单个文件，返回 (chunk_count, source_name, error_msg)

    Args:
        file_path: 文件绝对路径

    Returns:
        (导入chunk数, 来源名, 错误信息或None)
    """
    source = _source_name(file_path)
    try:
        text = _read_file(file_path)
        if text is None:
            return 0, source, f"无法解析文件: {file_path}"
        if not text.strip():
            return 0, source, f"文件内容为空: {file_path}"

        chunks = split_text(text, source)
        if not chunks:
            return 0, source, "分块后无有效内容"

        texts = [c["text"] for c in chunks]
        metas = [{"source": c["source"], "chunk_index": c["chunk_index"]} for c in chunks]
        ids = [f"{source}-{c['chunk_index']}" for c in chunks]

        _batch_add_to_chroma(texts, metas, ids)
        logger.info(f"Ingested '{source}': {len(chunks)} chunks")
        return len(chunks), source, None

    except Exception as e:
        logger.exception(f"Ingest error {file_path}")
        return 0, source, str(e)


def ingest_directory(dir_path: str, clear_first: bool = False) -> dict:
    """扫描目录批量导入所有支持的文件

    Args:
        dir_path: 知识库目录路径
        clear_first: 是否在导入前清空已有数据

    Returns:
        {"ingested": int, "sources": [str], "errors": [str]}
    """
    if clear_first:
        reset_collection()

    supported_exts = {".md", ".pdf", ".pptx", ".ppt"}
    files = [
        os.path.join(dir_path, f)
        for f in os.listdir(dir_path)
        if os.path.splitext(f)[1].lower() in supported_exts
    ]

    if not files:
        logger.warning(f"No supported files found in {dir_path}")
        return {"ingested": 0, "sources": [], "errors": [f"目录 {dir_path} 中无支持的文档格式"]}

    logger.info(f"Found {len(files)} file(s) to ingest from {dir_path}")
    total = 0
    sources = []
    errors = []

    for file_path in sorted(files):
        count, source, error = ingest_file(file_path)
        total += count
        if source:
            sources.append(source)
        if error:
            errors.append(error)

    logger.info(f"Ingestion complete: {total} chunks from {len(sources)} sources, {len(errors)} errors")
    return {"ingested": total, "sources": sources, "errors": errors}
