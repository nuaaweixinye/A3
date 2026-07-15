// Agent 配置注册中心
// 集中管理所有资源 Agent 的元数据与运行参数，替代各文件中的硬编码
//
// 使用方式：
//   import { getAgentConfig, AGENT_IDS } from "@/backend/agents/registry";
//   const config = getAgentConfig("doc");

import type { ResourceType } from "@/backend/types";

export interface AgentConfig {
  id: ResourceType;
  name: string;           // 中文名称
  icon: string;           // 展示图标
  description: string;    // 一句话描述
  temperature: number;    // 默认 temperature
  model?: string;         // 覆盖全局 MODEL_ROUTES（可选）
  timeout: number;        // 超时时间 (ms)
  retryCount: number;     // 失败重试次数
}

/** 全部 6 个资源 Agent 的配置 */
const AGENT_CONFIGS: Record<ResourceType, AgentConfig> = {
  doc: {
    id: "doc",
    name: "讲解文档",
    icon: "📄",
    description: "生成个性化 Markdown 讲解文档",
    temperature: 0.6,
    timeout: 120_000,
    retryCount: 2,
  },
  quiz: {
    id: "quiz",
    name: "练习题库",
    icon: "❓",
    description: "生成混合题型练习题",
    temperature: 0.6,
    timeout: 120_000,
    retryCount: 2,
  },
  mindmap: {
    id: "mindmap",
    name: "思维导图",
    icon: "🧠",
    description: "生成知识点层级导图",
    temperature: 0.5,
    timeout: 90_000,
    retryCount: 2,
  },
  video: {
    id: "video",
    name: "教学视频",
    icon: "🎬",
    description: "生成分镜脚本 + SVG 动画",
    temperature: 0.7,
    timeout: 180_000,
    retryCount: 2,
  },
  code: {
    id: "code",
    name: "代码实操",
    icon: "💻",
    description: "生成可运行代码示例",
    temperature: 0.5,
    timeout: 120_000,
    retryCount: 2,
  },
  reading: {
    id: "reading",
    name: "拓展阅读",
    icon: "📚",
    description: "生成分级推荐阅读清单",
    temperature: 0.6,
    timeout: 90_000,
    retryCount: 2,
  },
};

/** 所有 Agent ID 列表（遍历用） */
export const AGENT_IDS: ResourceType[] = [
  "doc",
  "quiz",
  "mindmap",
  "video",
  "code",
  "reading",
];

/** 获取单个 Agent 配置 */
export function getAgentConfig(id: ResourceType): AgentConfig {
  return AGENT_CONFIGS[id];
}

/** 获取所有 Agent 配置 */
export function getAllAgentConfigs(): AgentConfig[] {
  return AGENT_IDS.map((id) => AGENT_CONFIGS[id]);
}

/** Agent 中文名称映射 */
export const AGENT_LABEL: Record<ResourceType, string> = Object.fromEntries(
  AGENT_IDS.map((id) => [id, AGENT_CONFIGS[id].name]),
) as Record<ResourceType, string>;
