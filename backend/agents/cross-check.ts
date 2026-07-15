// 跨 Agent 交叉验证
// 防幻觉补充层：规则检查（非 LLM）+ LLM 交叉检查（不同 Prompt 视角审视）
// 不包含前端卡片展示——那是 🅱 前端的工作

import { callSpark, type ChatMsg } from "@/backend/ai/spark";
import type { GeneratedResource, ResourceType } from "@/backend/types";

/** 交叉验证结果 */
export interface CrossCheckResult {
  passed: boolean;
  issues: string[];
  /** LLM 交叉检查的审查方 Agent 类型（如 "quiz"、"doc"） */
  reviewer?: string;
}

// ==================== 规则检查（非 LLM，零成本） ====================

function checkMindmap(content: string): CrossCheckResult {
  const issues: string[] = [];
  // 必须有层级嵌套列表
  const listLines = content.match(/^[-*]\s+/gm);
  if (!listLines || listLines.length < 3) {
    issues.push("思维导图层级节点不足（需 ≥3 个列表项）");
  }
  // 至少有一个二级缩进（证明有 ≥2 层）
  const hasSecondLevel = /^\s{2,4}[-*]\s+/m.test(content);
  if (!hasSecondLevel) {
    issues.push("思维导图层级不足（需 ≥2 层深度）");
  }
  return { passed: issues.length === 0, issues };
}

function checkVideo(content: string): CrossCheckResult {
  const issues: string[] = [];
  const scenes = content.match(/##\s+分镜\s*\d+/g);
  if (!scenes || scenes.length < 3) {
    issues.push(`教学视频分镜数不足（需 ≥3 个，当前 ${scenes?.length ?? 0} 个）`);
  }
  // 检查 SVG viewBox
  const svgBlocks = content.match(/```svg\s*([\s\S]*?)```/g);
  if (svgBlocks) {
    for (let i = 0; i < svgBlocks.length; i++) {
      if (!svgBlocks[i].includes('viewBox="0 0 400 200"')) {
        issues.push(`分镜 ${i + 1} SVG 的 viewBox 不是 "0 0 400 200"`);
      }
      if (!svgBlocks[i].includes("<style>") || !svgBlocks[i].includes("@keyframes")) {
        issues.push(`分镜 ${i + 1} SVG 缺少 <style> 或 @keyframes 动画`);
      }
    }
  } else {
    issues.push("教学视频缺少 SVG 动画内容");
  }
  return { passed: issues.length === 0, issues };
}

function checkQuiz(content: string): CrossCheckResult {
  const issues: string[] = [];
  const questions = content.match(/##\s+.+[：:]/g);
  if (!questions || questions.length < 4) {
    issues.push(`练习题库题目数不足（需 ≥4 道，当前 ${questions?.length ?? 0} 道）`);
  }
  // 检查是否有答案标记
  const answers = content.match(/>\s*\*\*答案\*\*/g);
  if (!answers || answers.length < (questions?.length ?? 0)) {
    issues.push("部分题目缺少答案标注");
  }
  // 检查题型多样性
  const hasSingle = /单选题/.test(content);
  const hasFill = /填空题/.test(content);
  const hasShort = /简答题/.test(content);
  const typeCount = [hasSingle, hasFill, hasShort].filter(Boolean).length;
  if (typeCount < 2) {
    issues.push(`题型覆盖不足（需 ≥2 种，当前 ${typeCount} 种）`);
  }
  return { passed: issues.length === 0, issues };
}

function checkCode(content: string): CrossCheckResult {
  const issues: string[] = [];
  const codeBlocks = content.match(/```[\s\S]*?```/g);
  if (!codeBlocks || codeBlocks.length < 1) {
    issues.push("代码实操缺少代码块");
  }
  if (!/复杂度分析/.test(content)) {
    issues.push("代码实操缺少复杂度分析小节");
  }
  if (!/易错点/.test(content) && !/注意/.test(content)) {
    issues.push("代码实操缺少易错点/注意事项");
  }
  return { passed: issues.length === 0, issues };
}

function checkDoc(content: string): CrossCheckResult {
  const issues: string[] = [];
  if (!/\|.+\|/.test(content)) {
    issues.push("讲解文档缺少表格");
  }
  const hasDiagram = /```mermaid/.test(content) || /```\w+/.test(content);
  if (!hasDiagram) {
    issues.push("讲解文档缺少 Mermaid 图解或代码块");
  }
  const sections = content.match(/^##\s+/gm);
  if (!sections || sections.length < 3) {
    issues.push(`讲解文档小节数不足（需 ≥3 个，当前 ${sections?.length ?? 0} 个）`);
  }
  return { passed: issues.length === 0, issues };
}

function checkReading(content: string): CrossCheckResult {
  const issues: string[] = [];
  // 统计推荐条数（匹配形如 "**N." 或 "N.**" 的模式）
  const items = content.match(/\*\*\d+\.\*\*/g);
  if (!items || items.length < 4) {
    issues.push(`拓展阅读推荐条目不足（需 ≥4 条，当前 ${items?.length ?? 0} 条）`);
  }
  return { passed: issues.length === 0, issues };
}

/** 全部规则检查映射 */
const RULE_CHECKS: Record<ResourceType, (content: string) => CrossCheckResult> = {
  doc: checkDoc,
  quiz: checkQuiz,
  mindmap: checkMindmap,
  video: checkVideo,
  code: checkCode,
  reading: checkReading,
};

// ==================== LLM 交叉检查 ====================

/** 用 QuizAgent 的视角检查 DocAgent 的输出 */
async function crossCheckDocByQuiz(content: string): Promise<CrossCheckResult> {
  const systemPrompt = `你是题库生成专家。请审视以下讲解文档，检查其是否遗漏了应该出题考查的核心概念。
只输出 JSON（不要 markdown 代码块）：
{ "issues": ["遗漏的概念或问题"], "passed": true或false }
若文档内容完整没有遗漏，issues 为空数组，passed 为 true。`;

  const userPrompt = `以下是讲解文档的内容：
"""
${content.slice(0, 3000)}
"""

请检查是否有遗漏的核心概念。`;

  try {
    const messages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    const raw = await callSpark({ messages, stage: "eval", temperature: 0.3 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        passed: parsed.passed !== false,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        reviewer: "quiz",
      };
    }
  } catch {
    /* LLM 检查失败不影响主流程 */
  }
  return { passed: true, issues: [], reviewer: "quiz" };
}

/** 用 DocAgent 的视角检查 CodeAgent 的输出 */
async function crossCheckCodeByDoc(content: string): Promise<CrossCheckResult> {
  const systemPrompt = `你是课程讲解专家。请审视以下代码实操案例，检查代码是否正确体现了核心原理、是否有明显的逻辑错误。
只输出 JSON（不要 markdown 代码块）：
{ "issues": ["发现的问题"], "passed": true或false }
若代码正确无误，issues 为空数组，passed 为 true。`;

  const userPrompt = `以下是代码实操案例的内容：
"""
${content.slice(0, 3000)}
"""

请检查代码与原理是否一致。`;

  try {
    const messages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    const raw = await callSpark({ messages, stage: "eval", temperature: 0.3 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        passed: parsed.passed !== false,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        reviewer: "doc",
      };
    }
  } catch {
    /* LLM 检查失败不影响主流程 */
  }
  return { passed: true, issues: [], reviewer: "doc" };
}

// ==================== 统一入口 ====================

/** 运行全部交叉验证（规则检查 + LLM 交叉检查），返回 id→结果 映射 */
export async function runCrossChecks(
  resources: GeneratedResource[],
): Promise<Record<string, CrossCheckResult>> {
  const results: Record<string, CrossCheckResult> = {};

  for (const r of resources) {
    // 1. 规则检查
    const check = RULE_CHECKS[r.type];
    if (check) {
      results[r.id] = check(r.content);
    }

    // 2. LLM 交叉检查（仅对 doc 和 code 做）
    if (r.type === "doc") {
      try {
        const llmCheck = await crossCheckDocByQuiz(r.content);
        // 合并规则检查和 LLM 检查结果
        const existing = results[r.id];
        results[r.id] = {
          passed: existing.passed && llmCheck.passed,
          issues: [...existing.issues, ...llmCheck.issues],
          reviewer: llmCheck.reviewer,
        };
      } catch {
        /* LLM 检查失败保留规则检查结果 */
      }
    }
    if (r.type === "code") {
      try {
        const llmCheck = await crossCheckCodeByDoc(r.content);
        const existing = results[r.id];
        results[r.id] = {
          passed: existing.passed && llmCheck.passed,
          issues: [...existing.issues, ...llmCheck.issues],
          reviewer: llmCheck.reviewer,
        };
      } catch {
        /* LLM 检查失败保留规则检查结果 */
      }
    }
  }

  return results;
}
