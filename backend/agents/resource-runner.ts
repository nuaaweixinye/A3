// 资源生成 Agent 共享运行器
// 统一处理：加载 Prompt → RAG 检索（防幻觉第 1 层）→ 星火流式生成 → 通过 emit 推送
//   resource_start / resource_delta / resource 事件到 SSE 通道。
// 各具体资源 Agent 只需声明类型并调用 runResourceAgent。
//
// v2 改动：
//   - 从 backend/prompts/ 加载 Agent 专属 Prompt（模板化）
//   - 增加重试机制（指数退避，最多 N 次）
//   - 增加超时控制（AbortController）
//   - 支持注入 AgentContext 实现 Agent 间内容协同
//   - 保留 ANTI_HALLUCINATION_RULES 导出以兼容 tutor-agent

import { streamSpark, type ChatMsg, type Stage } from "@/backend/ai/spark";
import { searchKnowledge, formatContext } from "@/backend/knowledge/retriever";
import { factCheck } from "@/backend/knowledge/fact-check";
import { getAgentConfig } from "@/backend/agents/registry";
import { ANTI_HALLUCINATION } from "@/backend/prompts/snippets";
import type {
  AgentEvent,
  GeneratedResource,
  ResourceTask,
  ResourceType,
  StudentProfile,
} from "@/backend/types";
import { nanoid } from "nanoid";

// 向后兼容：tutor-agent 仍引用此常量
export { ANTI_HALLUCINATION as ANTI_HALLUCINATION_RULES };

/** 事件发射器：把 Agent 事件推送到 SSE 通道 */
export type Emitter = (event: AgentEvent) => void;

/** AgentContext 条目：Agent 间共享的轻量摘要 */
export interface AgentContextEntry {
  agentType: ResourceType;
  keyPoints: string[];
  flags: string[];
}

/** 格式化 AgentContext 为可注入 Prompt 的文本 */
export function formatAgentContext(
  entries: Record<string, AgentContextEntry>,
): string {
  const list = Object.values(entries);
  if (list.length === 0) return "";
  return list
    .map(
      (e) =>
        `【${e.agentType}】关键知识点：${e.keyPoints.join("、")}${e.flags.length ? " | 标记：" + e.flags.join("、") : ""}`,
    )
    .join("\n");
}

/** 从生成内容中提取轻量摘要（非 LLM，基于规则） */
export function extractAgentContext(
  agentType: ResourceType,
  content: string,
): AgentContextEntry {
  // 提取 ## 标题作为关键知识点
  const headings = content.match(/^##\s+(.+)$/gm);
  const keyPoints = (headings ?? [])
    .map((h) => h.replace(/^##\s+/, "").replace(/[🟢🟡🔴⭐⚠️🔗]/g, "").trim())
    .filter((h) => h.length > 0 && h.length < 40)
    .slice(0, 6);

  // 提取易错/重点标记
  const flags: string[] = [];
  if (/易错|误区|注意|警告|陷阱/.test(content)) {
    flags.push("含易错点");
  }
  if (/重点|核心|关键/.test(content)) {
    flags.push("含重点内容");
  }

  return { agentType, keyPoints, flags };
}

export interface RunResourceOptions {
  profile: StudentProfile;
  task: ResourceTask;
  emit?: Emitter;
  temperature?: number;
  /** 其他 Agent 已产出的摘要，用于内容协同 */
  agentContext?: Record<string, AgentContextEntry>;
  /** 覆盖默认 System Prompt（可选，不传则从 prompts/ 加载） */
  systemPrompt?: string;
  /** 覆盖默认 User Prompt 构造（可选，不传则从 prompts/ 加载） */
  buildUserPrompt?: (ctx: {
    task: ResourceTask;
    profile: StudentProfile;
    context: string;
    agentContext: string;
  }) => string;
}

/** Prompt 模块接口：每个 prompts/xxx.ts 需导出的内容 */
interface PromptModule {
  SYSTEM_PROMPT: string;
  buildUserPrompt: (params: {
    topic: string;
    profile: string;
    context: string;
    agentContext: string;
  }) => string;
}

/** 动态加载 Agent 专属 Prompt 模块 */
async function loadPromptModule(type: ResourceType): Promise<PromptModule> {
  switch (type) {
    case "doc":
      return (await import("@/backend/prompts/doc")) as unknown as PromptModule;
    case "quiz":
      return (await import("@/backend/prompts/quiz")) as unknown as PromptModule;
    case "mindmap":
      return (await import("@/backend/prompts/mindmap")) as unknown as PromptModule;
    case "video":
      return (await import("@/backend/prompts/video")) as unknown as PromptModule;
    case "code":
      return (await import("@/backend/prompts/code")) as unknown as PromptModule;
    case "reading":
      return (await import("@/backend/prompts/reading")) as unknown as PromptModule;
    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
}

/** 延迟重试 */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 运行一个资源 Agent：加载 Prompt → 检索 → 流式生成 → 推送事件 → 返回资源对象
 * 包含重试机制（指数退避）和超时控制。
 */
export async function runResourceAgent(
  opts: RunResourceOptions,
): Promise<GeneratedResource> {
  const config = getAgentConfig(opts.task.type);
  const maxRetries = config.retryCount;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runOnce(opts, config.timeout);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // 仅对网络/超时错误重试；内容违规/拒答不重试
      const msg = lastError.message.toLowerCase();
      const canRetry =
        attempt < maxRetries &&
        (msg.includes("fetch") ||
          msg.includes("timeout") ||
          msg.includes("abort") ||
          msg.includes("network") ||
          msg.includes("econnreset") ||
          msg.includes("socket"));

      if (!canRetry) break;

      const backoff = Math.min(1000 * Math.pow(2, attempt), 4000);
      console.warn(
        `[${opts.task.type}] 尝试 ${attempt + 1}/${maxRetries} 失败: ${lastError.message}，${backoff}ms 后重试...`,
      );
      await delay(backoff);
    }
  }

  // 所有重试耗尽：返回降级资源
  const id = nanoid();
  const errorResource: GeneratedResource = {
    id,
    type: opts.task.type,
    title: opts.task.topic,
    topic: opts.task.topic,
    content: `> ⚠️ 生成失败：${lastError?.message ?? "未知错误"}\n>\n> 请稍后重试或检查网络连接。`,
    sources: [],
    fact_check: { score: 0, flagged: ["生成失败"], checked: 0 },
    created_at: new Date().toISOString(),
  };
  opts.emit?.({ type: "resource", resource: errorResource });
  return errorResource;
}

/** 单次执行（含超时控制） */
async function runOnce(
  opts: RunResourceOptions,
  timeoutMs: number,
): Promise<GeneratedResource> {
  const { task, profile, emit, temperature, agentContext } = opts;

  // 加载 Prompt 模块：需要 systemPrompt 或 buildUserPrompt 时才加载
  const needDefaultSystemPrompt = !opts.systemPrompt;
  const needDefaultUserPrompt = !opts.buildUserPrompt;
  const promptMod =
    needDefaultSystemPrompt || needDefaultUserPrompt
      ? await loadPromptModule(task.type)
      : null;

  const systemPrompt =
    opts.systemPrompt ?? promptMod!.SYSTEM_PROMPT;

  const buildUserPrompt =
    opts.buildUserPrompt ??
    ((ctx: {
      task: ResourceTask;
      profile: StudentProfile;
      context: string;
      agentContext: string;
    }) =>
      promptMod!.buildUserPrompt({
        topic: ctx.task.topic,
        profile: JSON.stringify(ctx.profile),
        context: ctx.context,
        agentContext: ctx.agentContext,
      }));

  // RAG 检索
  const chunks = await searchKnowledge(task.topic, 5);
  const context = formatContext(chunks);
  const sources = Array.from(new Set(chunks.map((c) => c.source)));
  const id = nanoid();

  // 格式化 AgentContext
  const agentContextStr = agentContext
    ? formatAgentContext(agentContext)
    : "";

  emit?.({
    type: "resource_start",
    id,
    resType: task.type,
    title: task.topic,
    topic: task.topic,
  });

  const agentTemp = opts.temperature ?? getAgentConfig(task.type).temperature;

  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: buildUserPrompt({ task, profile, context, agentContext: agentContextStr }),
    },
  ];

  // 超时控制
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  let content = "";
  try {
    for await (const delta of streamSpark({
      messages,
      stage: task.type as Stage,
      temperature: agentTemp,
      signal: abortController.signal,
    })) {
      content += delta;
      emit?.({ type: "resource_delta", id, text: delta });
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // 防幻觉第 3 层：事实核查
  const factCheckResult = await factCheck(content, task.topic);

  // 提取 AgentContext 摘要（用于其他 Agent 协同）
  const summary = extractAgentContext(task.type, content);

  const resource: GeneratedResource = {
    id,
    type: task.type,
    title: task.topic,
    topic: task.topic,
    content,
    sources,
    fact_check: factCheckResult,
    created_at: new Date().toISOString(),
  };
  emit?.({ type: "resource", resource });

  // 通过 resource 事件附加 agentContext（不改变事件协议，附加字段）
  emit?.({
    type: "resource",
    resource: { ...resource },
    ...{ agentContext: summary },
  } as AgentEvent);

  return resource;
}

/** 构造通用的 user prompt 头部（主题/画像/知识库）—— 保留给不使用 Prompt 模块的旧调用方 */
export function buildPromptHead(opts: {
  task: ResourceTask;
  profile: StudentProfile;
  context: string;
}): string {
  const { task, profile, context } = opts;
  return `【主题】${task.topic}
${task.reason ? `【生成理由】${task.reason}` : ""}

【学生画像】
${JSON.stringify(profile)}

【知识库内容】（务必以此为主要事实来源）
"""
${context}
"""`;
}
