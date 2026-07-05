"""事实核查服务 —— 防幻觉第 3 层

对 LLM 生成内容做交叉验证：
1. 提取"可核声明"（含复杂度 O(...) 或数值事实的句子）
2. 每条声明回查 Chroma 知识库
3. 判断声明与检索证据的 token 重叠度 → 给出 by-score 与 flagged 列表
"""

import re
import logging
from typing import List, Tuple

from app.services.retriever import search
from app.core.config import FACT_CHECK_MIN_LEN, FACT_CHECK_MAX_LEN

logger = logging.getLogger(__name__)


# ─── 简易 CJK + Latin 分词 ─────────────────────────────

def _tokenize(text: str) -> List[str]:
    """极简分词：CJK 逐字 + 拉丁/数字连续串"""
    tokens: List[str] = []
    lower = text.lower()
    pattern = re.compile(r"[一-龥]|[a-z0-9]+")
    for m in pattern.finditer(lower):
        if len(m[0]) > 1 or re.match(r"[一-龥]", m[0]):
            tokens.append(m[0])
    return tokens


# ─── 声明提取 ──────────────────────────────────────────

def _split_sentences(content: str) -> List[str]:
    """将 Markdown 内容切分为'句子'，剔除代码块/标题/引用"""
    cleaned = content
    # 移除代码块
    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    # 移除行内代码
    cleaned = re.sub(r"`[^`]+`", " ", cleaned)
    # 移除标题标记
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    # 移除引用标记
    cleaned = re.sub(r"^\s{0,3}>", "", cleaned, flags=re.MULTILINE)
    # 移除表格分隔线
    cleaned = re.sub(r"\|[\s\-:|]+\|", " ", cleaned)

    parts = re.split(r"[。！？\n]", cleaned)
    result = []
    for p in parts:
        p = p.replace("|", " ").replace("*", "").replace("_", "").replace("`", "").strip()
        if FACT_CHECK_MIN_LEN <= len(p) <= FACT_CHECK_MAX_LEN:
            result.append(p)
    return result


def _is_checkable(sentence: str) -> bool:
    """判定是否为'可核声明'：含复杂度 O(...) 或数值类事实"""
    # 时间复杂度/空间复杂度
    if re.search(r"O\s*\(|时间复杂度|空间复杂度|最坏|平均|最优", sentence):
        return True
    # 含至少一个数字
    if re.search(r"\b\d+(\.\d+)?\b", sentence):
        return True
    return False


def _has_overlap(claim: str, evidence_text: str) -> bool:
    """判断声明与证据在 token 层面有足够重叠"""
    claim_tokens = set(_tokenize(claim))
    evidence_tokens = set(_tokenize(evidence_text))
    hit = sum(1 for t in claim_tokens if t in evidence_tokens)
    # 至少 2 个内容 token 命中，视为有佐证
    return hit >= 2


# ─── 主入口 ────────────────────────────────────────────

def verify(content: str, topic: str = "") -> dict:
    """事实核查主函数

    Args:
        content: 待核查的生成内容（Markdown）
        topic: 主题词（用于辅助检索，可选）

    Returns:
        {"score": 0-100, "flagged": [str], "checked": int}
    """
    sentences = _split_sentences(content)
    checkable = [s for s in sentences if _is_checkable(s)]

    if not checkable:
        logger.debug("No checkable claims found in content")
        return {"score": 100, "flagged": [], "checked": 0}

    with_evidence = 0
    flagged: List[str] = []

    for s in checkable:
        # 回查知识库（以 topic + 声明做 query）
        query = f"{topic} {s}" if topic else s
        try:
            hits = search(query, top_k=2)
        except Exception as e:
            logger.warning(f"Search failed for fact-check: {e}")
            continue

        evidence_text = " ".join(h.text for h in hits) if hits else ""
        if evidence_text and _has_overlap(s, evidence_text):
            with_evidence += 1
        else:
            # 截断长声明用于输出
            truncated = s[:60] + "…" if len(s) > 60 else s
            flagged.append(truncated)

    score = round((with_evidence / len(checkable)) * 100)
    result = {
        "score": score,
        "flagged": flagged,
        "checked": len(checkable),
    }
    logger.info(f"Fact-check: score={score}%, checked={len(checkable)}, flagged={len(flagged)}")
    return result
