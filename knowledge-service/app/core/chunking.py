"""文档分块策略 —— 参考 LangChain RecursiveCharacterTextSplitter

对 Markdown / 纯文本按段落 → 句子 → 字符的优先级递归切分，
块大小 500 字符、重叠 50 字符（与赛题开发指南 §07 一致）。
"""

from typing import List

from langchain.text_splitter import RecursiveCharacterTextSplitter

from app.core.config import CHUNK_SIZE, CHUNK_OVERLAP


def create_splitter() -> RecursiveCharacterTextSplitter:
    """创建针对中英文混合文本的分块器"""
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=[
            "\n## ",       # Markdown 二级标题
            "\n### ",      # Markdown 三级标题
            "\n\n",        # 段落
            "\n",          # 行
            "。",          # 中文句号
            ". ",          # 英文句号
            " ",           # 空格
            "",            # 逐字符
        ],
        keep_separator=True,  # 保留标题信息便于溯源
    )


def split_text(text: str, source: str = "") -> List[dict]:
    """将单篇文档文本切分为若干 chunk，返回带元数据的字典列表

    Args:
        text: 文档全文
        source: 来源名称（如 "01-数组"）

    Returns:
        [{"text": "...", "source": "01-数组", "chunk_index": 0}, ...]
    """
    splitter = create_splitter()
    docs = splitter.create_documents(
        texts=[text],
        metadatas=[{"source": source}],
    )
    chunks = []
    for i, doc in enumerate(docs):
        chunks.append({
            "text": doc.page_content,
            "source": source,
            "chunk_index": i,
        })
    return chunks


def split_texts(texts: List[str], sources: List[str]) -> List[dict]:
    """批量文档分块"""
    all_chunks = []
    for text, source in zip(texts, sources):
        all_chunks.extend(split_text(text, source))
    return all_chunks
