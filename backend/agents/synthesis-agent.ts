// 智能体 · 综合摘要 Agent（SynthesisAgent）
// 在 6 个资源 Agent 全部完成后运行，综合所有产出生成"学习导览"。
// 不是调度 Agent，是后处理汇总 Agent。与 OpenMAIC Director 完全不同。

import { callSpark, type ChatMsg } from "@/backend/ai/spark";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/backend/prompts/synthesis";
import {
  formatAgentContext,
  type Emitter,
  type AgentContextEntry,
} from "@/backend/agents/resource-runner";
import type { GeneratedResource, StudentProfile } from "@/backend/types";
import { nanoid } from "nanoid";

/** 资源摘要：从 GeneratedResource 中提取关键信息 */
interface ResourceSummary {
  type: string;
  title: string;
  snippet: string;
}

function summarizeResource(r: GeneratedResource): ResourceSummary {
  // 提取前 200 字符作为摘要片段（去掉 markdown 标记）
  const cleaned = r.content
    .replace(/[#*>`~]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 200);
  return {
    type: r.type,
    title: r.title,
    snippet: cleaned,
  };
}

export async function generateSynthesis(opts: {
  profile: StudentProfile;
  primaryTopic: string;
  resources: GeneratedResource[];
  agentContext?: Record<string, AgentContextEntry>;
  emit?: Emitter;
}): Promise<GeneratedResource> {
  const { profile, primaryTopic, resources, agentContext, emit } = opts;

  // 汇总所有资源的摘要
  const summaries = resources.map(summarizeResource);
  const resourceSummaries = summaries
    .map(
      (s, i) =>
        `### ${i + 1}. [${s.type}] ${s.title}\n> ${s.snippet}...\n`,
    )
    .join("\n");

  const agentContextStr = agentContext
    ? formatAgentContext(agentContext)
    : "";

  const id = nanoid();

  emit?.({
    type: "status",
    agent: "synthesis",
    message: "综合摘要智能体正在生成学习导览…",
  });

  const userPrompt = buildUserPrompt({
    topic: primaryTopic,
    profile: JSON.stringify(profile),
    resourceSummaries,
    agentContext: agentContextStr,
  });

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const content = await callSpark({
    messages,
    stage: "doc",
    temperature: 0.5,
  });

  const resource: GeneratedResource = {
    id,
    type: "doc",
    title: `📖 ${primaryTopic} · 学习导览`,
    topic: primaryTopic,
    content,
    sources: [],
    created_at: new Date().toISOString(),
  };

  emit?.({ type: "resource", resource });

  return resource;
}
