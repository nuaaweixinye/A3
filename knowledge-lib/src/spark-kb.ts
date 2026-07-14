/**
 * 讯飞星火知识库 (ChatDoc) 直接调用封装
 *
 * 提供：语义检索、事实验证、文件上传、文件列表。
 */

import { authHeaders, getSparkConfig } from "./spark-auth";

const CHATDOC_HOST = "https://chatdoc.xfyun.cn";

// ─── 类型定义 ──────────────────────────────────────────

export interface SearchResultItem {
  id: string;
  text: string;
  source: string;
  score: number;
}

export interface FactCheckResult {
  score: number;
  flagged: string[];
  checked: number;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
}

// ─── 事实验证工具函数 ──────────────────────────────────

function splitFactSentences(content: string): string[] {
  let cleaned = content;
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " ");
  cleaned = cleaned.replace(/`[^`]+`/g, " ");
  cleaned = cleaned.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  cleaned = cleaned.replace(/^\s{0,3}>/gm, "");
  const parts = cleaned.split(/[。！？\n]/);
  return parts
    .map((p) => p.replace(/\|/g, " ").replace(/\*/g, "").replace(/_/g, "").trim())
    .filter((p) => p.length >= 6 && p.length <= 120);
}

function isFactCheckable(sentence: string): boolean {
  if (/O\s*\(|时间复杂度|空间复杂度|最坏|平均|最优/.test(sentence)) return true;
  if (/\b\d+(\.\d+)?\b/.test(sentence)) return true;
  return false;
}

// ─── 核心 API ─────────────────────────────────────────

export async function search(
  query: string,
  topK: number = 5
): Promise<SearchResultItem[]> {
  const headers = {
    ...authHeaders(),
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: query }],
    topN: topK,
    chatExtends: {
      wikiPromptTpl:
        "请根据以上内容检索相关知识点，不需要回答问题，只需要列出最相关的文档片段原文。",
      temperature: 0.3,
    },
  };

  const { repoId } = getSparkConfig();
  if (repoId) {
    body.repoIds = [repoId];
  }

  const resp = await fetch(`${CHATDOC_HOST}/openapi/v2/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`ChatDoc search failed: ${resp.status} ${resp.statusText}`);
  }

  const rawText = await resp.text();

  const references: Array<Record<string, unknown>> = [];
  const fullText: string[] = [];

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload);
      const st = obj.status;
      if (st === 0 || st === 1 || st === 2) {
        fullText.push(obj.content || "");
      }
      if (obj.fileRefer && Array.isArray(obj.fileRefer) && obj.fileRefer.length > 0) {
        references.push(...obj.fileRefer);
      }
    } catch {
      // 忽略解析失败的行
    }
  }

  const items: SearchResultItem[] = [];
  for (let i = 0; i < Math.min(references.length, topK); i++) {
    const ref = references[i];
    items.push({
      id: (ref.file_id as string) || `spark-${i}`,
      text: (ref.text as string) || "",
      source: (ref.file_name as string) || "星火知识库",
      score: Math.round(((ref.score as number) || 0.8) * 10000) / 10000,
    });
  }

  if (items.length === 0) {
    const combined = fullText.join("").trim();
    if (combined) {
      items.push({
        id: "spark-response",
        text: combined.slice(0, 500),
        source: "星火知识库",
        score: 0.5,
      });
    }
  }

  console.log(
    `Spark KB search: "${query.slice(0, 30)}..." -> ${items.length} results`
  );
  return items;
}

export async function factCheck(
  content: string,
  topic: string = ""
): Promise<FactCheckResult> {
  const sentences = splitFactSentences(content);
  const checkable = sentences.filter(isFactCheckable);

  if (checkable.length === 0) {
    return { score: 100, flagged: [], checked: 0 };
  }

  const flagged: string[] = [];
  let withEvidence = 0;

  for (const s of checkable) {
    try {
      const query = topic ? `${topic} ${s}` : s;
      const results = await search(query, 2);
      if (results.length > 0) {
        withEvidence++;
      } else {
        flagged.push(s.length > 60 ? s.slice(0, 60) + "…" : s);
      }
    } catch {
      flagged.push(s.length > 60 ? s.slice(0, 60) + "…" : s);
    }
  }

  const score =
    checkable.length > 0
      ? Math.round((withEvidence / checkable.length) * 100)
      : 100;
  return { score, flagged, checked: checkable.length };
}

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string
): Promise<UploadResult> {
  const headers = authHeaders();
  const formData = new FormData();

  const blob = new Blob([fileBuffer]);
  formData.append("file", blob, fileName);
  formData.append("fileName", fileName);
  formData.append("fileType", "wiki");
  formData.append("needSummary", "false");
  formData.append("stepByStep", "false");

  const resp = await fetch(`${CHATDOC_HOST}/openapi/v1/file/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const result = data.data || data;
  console.log(`Uploaded "${fileName}" -> ${result.fileId}`);
  return { fileId: result.fileId, fileName };
}

export async function listFiles(): Promise<Array<Record<string, unknown>>> {
  const headers = { ...authHeaders(), "Content-Type": "application/json" };
  const resp = await fetch(`${CHATDOC_HOST}/openapi/v1/file/list`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    throw new Error(`File list failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data.data?.files || [];
}