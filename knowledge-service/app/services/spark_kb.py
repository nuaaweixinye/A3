"""
讯飞星火知识库 Provider

对接讯飞星火知识库 (ChatDoc) API，提供：
- 文件上传 (PDF/PPTX/MD/Word)
- 状态查询
- 语义检索（向量检索 + 问答接口）
- 事实验证

基于官方 chatdoc-api-python-demo 的鉴权和接口规范。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from pathlib import Path
from typing import List, Optional

import httpx

from app.core.config import SPARK_APP_ID, SPARK_API_SECRET, SPARK_KB_REPO_ID
from app.models.schemas import SearchResultItem

logger = logging.getLogger(__name__)

# ─── 常量 ─────────────────────────────────────────

CHATDOC_HOST = "https://chatdoc.xfyun.cn"
UPLOAD_URL = f"{CHATDOC_HOST}/openapi/v1/file/upload"
STATUS_URL = f"{CHATDOC_HOST}/openapi/v1/file/status"
VECTOR_SEARCH_URL = f"{CHATDOC_HOST}/openapi/v1/vector/search"
FILE_LIST_URL = f"{CHATDOC_HOST}/openapi/v1/file/list"
CHAT_URL = f"{CHATDOC_HOST}/openapi/v2/chat"

TERMINAL_STATUSES = {"vectored", "failed"}
POLL_INTERVAL = 3
POLL_TIMEOUT = 300


# ─── 鉴权（官方 Demo 算法） ──────────────────────────

def _auth_headers() -> dict:
    """ChatDoc 鉴权: signature = base64(hmac-sha1(apiSecret, md5(appId+timestamp)))"""
    ts = str(int(time.time()))
    # Step 1: MD5(appId + timestamp)
    check_sum = hashlib.md5((SPARK_APP_ID + ts).encode("utf-8")).hexdigest()
    # Step 2: HMAC-SHA1(apiSecret, checkSum) → base64
    sig_raw = hmac.new(
        SPARK_API_SECRET.encode("utf-8"),
        check_sum.encode("utf-8"),
        digestmod=hashlib.sha1,
    ).digest()
    signature = base64.b64encode(sig_raw).decode("utf-8")
    return {"appId": SPARK_APP_ID, "timestamp": ts, "signature": signature}


# ─── 事实核查工具函数 ────────────────────────────

import re

def _split_fact_sentences(content: str) -> list:
    cleaned = content
    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    cleaned = re.sub(r"`[^`]+`", " ", cleaned)
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s{0,3}>", "", cleaned, flags=re.MULTILINE)
    parts = re.split(r"[。！？\n]", cleaned)
    return [p.replace("|", " ").replace("*", "").replace("_", "").strip()
            for p in parts if 6 <= len(p.strip()) <= 120]

def _is_fact_checkable(sentence: str) -> bool:
    if re.search(r"O\s*\(|时间复杂度|空间复杂度|最坏|平均|最优", sentence):
        return True
    if re.search(r"\b\d+(\.\d+)?\b", sentence):
        return True
    return False


# ─── Provider 类 ──────────────────────────────────

class SparkKBProvider:
    """讯飞星火知识库封装"""

    def __init__(self, repo_id: str | None = None):
        self.repo_id = repo_id or SPARK_KB_REPO_ID
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(60))
        return self._client

    # ── 文件上传 ──────────────────────────────

    async def upload_file(self, file_path: str) -> dict:
        client = await self._get_client()
        file_name = Path(file_path).name
        headers = _auth_headers()
        with open(file_path, "rb") as f:
            files = {"file": (file_name, f)}
            data = {
                "fileName": file_name,
                "fileType": "wiki",
                "needSummary": False,
                "stepByStep": False,
            }
            resp = await client.post(UPLOAD_URL, headers=headers, data=data, files=files)
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"Uploaded '{file_name}' response: {result}")
        return result.get("data", result)

    # ── 状态查询 ──────────────────────────────

    async def get_status(self, file_id: str) -> str:
        client = await self._get_client()
        headers = _auth_headers()
        resp = await client.post(STATUS_URL, headers=headers, json={"fileIds": [file_id]})
        resp.raise_for_status()
        data = resp.json()
        files = data.get("data", {}).get("files", [])
        return files[0].get("status", "unknown") if files else "unknown"

    async def wait_until_ready(self, file_id: str, timeout: int = POLL_TIMEOUT) -> str:
        import asyncio
        elapsed = 0
        while elapsed < timeout:
            status = await self.get_status(file_id)
            logger.info(f"  File {file_id}: {status} ({elapsed}s)")
            if status in TERMINAL_STATUSES:
                return status
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
        raise TimeoutError(f"File {file_id} timeout after {timeout}s")

    # ── 文件列表 ──────────────────────────────

    async def list_files(self) -> List[dict]:
        """获取 appId 下的文件列表"""
        client = await self._get_client()
        headers = {**_auth_headers(), "Content-Type": "application/json"}
        resp = await client.post(FILE_LIST_URL, headers=headers, json={})
        resp.raise_for_status()
        data = resp.json()
        files = data.get("data", {}).get("files", [])
        logger.info(f"File list: {len(files)} files")
        return files

    # ── 语义检索 ──────────────────────────────

    async def search(self, query: str, top_k: int = 5) -> List[SearchResultItem]:
        """向量检索 + ChatDoc 问答

        优先使用 /v1/vector/search 做纯检索，
        若无结果则回退到 /v2/chat 问答接口。
        """
        return await self._search_v2_chat(query, top_k)

    async def _search_v2_chat(self, query: str, top_k: int = 5) -> List[SearchResultItem]:
        """通过 /v2/chat 问答接口检索（支持 repoIds）"""
        client = await self._get_client()
        headers = {
            **_auth_headers(),
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

        body: dict = {
            "messages": [{"role": "user", "content": query}],
            "topN": top_k,
            "chatExtends": {
                "wikiPromptTpl": "请根据以上内容检索相关知识点，不需要回答问题，只需要列出最相关的文档片段原文。",
                "temperature": 0.3,
            },
        }
        if self.repo_id:
            body["repoIds"] = [self.repo_id]

        resp = await client.post(CHAT_URL, headers=headers, json=body)
        logger.info(f"ChatDoc v2/chat response: status={resp.status_code}")
        resp.raise_for_status()

        # 解析 SSE: 每行 data:{json}, status=0|1|2, content/fileRefer 在根级
        references = []
        full_text = []
        async for raw_bytes in resp.aiter_bytes():
            chunk = raw_bytes.decode("utf-8", errors="replace")
            for line in chunk.split("\n"):
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload or payload == "[DONE]":
                    continue
                try:
                    obj = json.loads(payload)
                except json.JSONDecodeError:
                    continue

                st = obj.get("status", -1)
                if st in (0, 1, 2):
                    c = obj.get("content") or ""
                    full_text.append(c)
                # fileRefer 在根级别，检查任意帧
                fr = obj.get("fileRefer")
                if fr and isinstance(fr, list) and len(fr) > 0:
                    references = fr
                    logger.info(f"Got {len(fr)} references at status={st}")

        items: List[SearchResultItem] = []
        for i, ref in enumerate(references[:top_k]):
            items.append(SearchResultItem(
                id=ref.get("file_id", f"spark-{i}"),
                text=ref.get("text", ""),
                source=ref.get("file_name", "星火知识库"),
                score=round(ref.get("score", 0.8), 4),
            ))
        if not items:
            combined = "".join(full_text).strip()
            if combined:
                items.append(SearchResultItem(
                    id="spark-response", text=combined[:500],
                    source="星火知识库", score=0.5,
                ))
        logger.info(f"Spark KB search: '{query[:30]}...' -> {len(items)} results")
        return items

    # ── 向量检索（HTTP） ──────────────────────

    async def vector_search(self, query: str, file_ids: List[str], top_k: int = 5) -> List[SearchResultItem]:
        """调用 /v1/vector/search 做纯向量检索"""
        client = await self._get_client()
        headers = {**_auth_headers(), "Content-Type": "application/json"}
        body = {
            "fileIds": file_ids,
            "content": query,
            "topN": top_k,
            "chatExtends": {"wikiFilterScore": 0.5},
        }
        resp = await client.post(VECTOR_SEARCH_URL, headers=headers, json=body)
        logger.info(f"Vector search response: status={resp.status_code}")
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Vector search result: {json.dumps(data, ensure_ascii=False)[:500]}")

        items: List[SearchResultItem] = []
        chunks = data.get("data", {}).get("chunks", [])
        for i, chunk in enumerate(chunks[:top_k]):
            items.append(SearchResultItem(
                id=chunk.get("chunkId", f"vec-{i}"),
                text=chunk.get("content", ""),
                source=chunk.get("fileName", "星火知识库"),
                score=round(chunk.get("score", 0.8), 4),
            ))
        return items

    # ── 事实验证 ──────────────────────────────

    async def fact_check(self, content: str, topic: str = "") -> dict:
        sentences = _split_fact_sentences(content)
        checkable = [s for s in sentences if _is_fact_checkable(s)]
        if not checkable:
            return {"score": 100, "flagged": [], "checked": 0}
        flagged = []
        with_evidence = 0
        for s in checkable:
            try:
                results = await self.search(f"{topic} {s}" if topic else s, top_k=2)
                if results:
                    with_evidence += 1
                else:
                    flagged.append(s[:60] + "…" if len(s) > 60 else s)
            except Exception:
                flagged.append(s[:60] + "…" if len(s) > 60 else s)
        score = round((with_evidence / len(checkable)) * 100) if checkable else 100
        return {"score": score, "flagged": flagged, "checked": len(checkable)}

    # ── 批量导入 ──────────────────────────────

    async def upload_directory(self, dir_path: str) -> dict:
        supported = {".md", ".pdf", ".pptx", ".ppt", ".doc", ".docx", ".txt"}
        files = sorted(
            f for f in os.listdir(dir_path)
            if os.path.splitext(f)[1].lower() in supported
        )
        results = []
        for f in files:
            path = os.path.join(dir_path, f)
            try:
                info = await self.upload_file(path)
                results.append({"file": f, "fileId": info.get("fileId", ""), "status": "ok"})
            except Exception as e:
                results.append({"file": f, "error": str(e)})
        return {"total": len(files), "results": results}

    # ── 辅助 ──────────────────────────────────

    async def _sse_lines(self, resp: httpx.Response):
        async for raw_bytes in resp.aiter_bytes():
            chunk = raw_bytes.decode("utf-8", errors="replace")
            for line in chunk.split("\n"):
                line = line.rstrip("\r")
                if line:
                    yield line

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


_provider: SparkKBProvider | None = None


def get_spark_kb() -> SparkKBProvider:
    global _provider
    if _provider is None:
        _provider = SparkKBProvider()
    return _provider
