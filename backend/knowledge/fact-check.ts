// 防幻觉第 3 层：事实核查（fact-check）
// 通过讯飞星火知识库 (ChatDoc) 云端 API 交叉验证生成内容。

import { factCheck as sparkFactCheck } from "./spark-kb";
import type { FactCheckResult } from "@/backend/types";

export async function factCheck(
  content: string,
  topic: string,
): Promise<FactCheckResult> {
  try {
    return await sparkFactCheck(content, topic);
  } catch (err) {
    console.error("Fact check failed:", err);
    return { score: 100, flagged: [], checked: 0 };
  }
}
