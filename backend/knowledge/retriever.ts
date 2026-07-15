// RAG 检索器（防幻觉第 1 层：检索约束）
//
// 通过讯飞星火知识库 (ChatDoc) 云端 API 进行语义检索。

import { search as sparkSearch } from "./spark-kb";

export interface KnowledgeChunk {
  id: string;
  text: string;
  source: string;
  score?: number;
}

export async function searchKnowledge(
  query: string,
  k = 5,
): Promise<KnowledgeChunk[]> {
  try {
    const results = await sparkSearch(query, k);
    return results.map((r) => ({
      id: r.id,
      text: r.text,
      source: r.source,
      score: r.score,
    }));
  } catch (err) {
    console.error("Knowledge search failed:", err);
    return [];
  }
}

export function formatContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return "（知识库中暂无直接相关内容）";
  return chunks
    .map((c) => `【来源：${c.source}】\n${c.text}`)
    .join("\n\n---\n\n");
}
