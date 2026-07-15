// 多智能体编排引擎（LangGraph.js StateGraph）
// 赛题硬性要求：须明确"多智能体协同框架"。
// 本图编排 9 个角色的智能体协同完成学习闭环：
//   画像构建(profile_builder) → 路径规划(path_planner)
//      ┌→ doc_gen      ┌→ quiz_gen    ┌→ mindmap_gen   （并行分发）
//      └→ video_gen     └→ code_gen    └→ reading_gen
//         ↓ 全部完成后 ↓
//      synthesis_agent（综合摘要 + 交叉验证）→ END
// 各节点通过注入的 emit 回调把状态与流式内容实时推送到 SSE 通道。
//
// v2 改动：
//   - 新增 AgentContext 通道：Agent 间共享轻量摘要
//   - 新增 synthesis_agent：6 资源汇总生成学习导览
//   - 集成 cross-check 交叉验证

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type {
  GeneratedResource,
  LearningPath,
  ResourceTask,
  ResourceType,
  StudentProfile,
  CrossCheckResult,
} from "@/backend/types";
import { extractProfile } from "@/backend/agents/profile-agent";
import { planPath } from "@/backend/agents/planner-agent";
import { generateDoc } from "@/backend/agents/doc-agent";
import { generateQuiz } from "@/backend/agents/quiz-agent";
import { generateMindmap } from "@/backend/agents/mindmap-agent";
import { generateVideo } from "@/backend/agents/video-agent";
import { generateCode } from "@/backend/agents/code-agent";
import { generateReading } from "@/backend/agents/reading-agent";
import { generateSynthesis } from "@/backend/agents/synthesis-agent";
import { runCrossChecks } from "@/backend/agents/cross-check";
import {
  type Emitter,
  type AgentContextEntry,
  extractAgentContext,
} from "@/backend/agents/resource-runner";

/** AgentContext 通道类型 */
type AgentContextMap = Record<string, AgentContextEntry>;

/** LangGraph 全局共享状态 */
const LearningGraphState = Annotation.Root({
  userMessage: Annotation<string>({ reducer: (_, y) => y ?? "", default: () => "" }),
  profile: Annotation<StudentProfile | null>({
    reducer: (_, y) => y ?? null,
    default: () => null,
  }),
  path: Annotation<LearningPath | null>({
    reducer: (_, y) => y ?? null,
    default: () => null,
  }),
  primaryTopic: Annotation<string>({
    reducer: (_, y) => y ?? "",
    default: () => "",
  }),
  resourceTasks: Annotation<ResourceTask[]>({
    reducer: (_, y) => y ?? [],
    default: () => [],
  }),
  resources: Annotation<GeneratedResource[]>({
    reducer: (a, b) => [...a, ...(b ?? [])],
    default: () => [],
  }),
  /** Agent 间共享上下文：先完成的 Agent 写入摘要，后完成的 Agent 可读取 */
  agentContext: Annotation<AgentContextMap>({
    reducer: (prev, update) => ({ ...prev, ...(update ?? {}) }),
    default: () => ({}),
  }),
  /** 交叉验证结果 */
  crossChecks: Annotation<Record<string, CrossCheckResult>>({
    reducer: (prev, update) => ({ ...prev, ...(update ?? {}) }),
    default: () => ({}),
  }),
});

type GraphConfig = {
  configurable?: {
    emit?: Emitter;
  };
};

type ConfigArg = GraphConfig | undefined;
type State = typeof LearningGraphState.State;

/** 资源生成函数签名 */
type AgentFn = (
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
) => Promise<GeneratedResource>;

const GENERATORS: Record<ResourceType, AgentFn> = {
  doc: generateDoc,
  quiz: generateQuiz,
  mindmap: generateMindmap,
  video: generateVideo,
  code: generateCode,
  reading: generateReading,
};

const RESOURCE_LABEL: Record<ResourceType, string> = {
  doc: "讲解文档",
  quiz: "练习题库",
  mindmap: "思维导图",
  video: "教学视频",
  code: "代码实操",
  reading: "拓展阅读",
};

/** 节点 1：画像构建智能体 */
async function profileNode(state: State, config: ConfigArg) {
  config?.configurable?.emit?.({
    type: "status",
    agent: "profile",
    message: "正在通过对话构建 6 维度学习画像…",
  });
  const profile = await extractProfile(state.userMessage, state.profile);
  return { profile };
}

/** 节点 2：路径规划智能体 */
async function plannerNode(state: State, config: ConfigArg) {
  config?.configurable?.emit?.({
    type: "status",
    agent: "planner",
    message: "正在规划个性化学习路径…",
  });
  const { path, primaryTopic, resourceTasks } = await planPath(
    state.profile!,
    state.userMessage,
  );
  return { path, primaryTopic, resourceTasks };
}

/** 资源节点工厂：执行 Agent → 提取 AgentContext → 写入 State */
function makeResourceNode(type: ResourceType) {
  return async (state: State, config: ConfigArg) => {
    const emit = config?.configurable?.emit;
    const task =
      state.resourceTasks.find((t) => t.type === type) ??
      ({ type, topic: state.primaryTopic } as ResourceTask);
    emit?.({
      type: "status",
      agent: type,
      message: `${RESOURCE_LABEL[type]}智能体工作中…`,
    });

    // 调用资源 Agent（当前 agentContext 通过 GraphConfig 透传）
    const resource = await GENERATORS[type](state.profile!, task, emit);

    // 提取本 Agent 的轻量摘要，写入 agentContext 通道
    const entry = extractAgentContext(type, resource.content);
    const update: Record<string, AgentContextEntry> = {};
    update[type] = entry;

    return { resources: [resource], agentContext: update };
  };
}

/** 节点 8：综合摘要 + 交叉验证 */
async function synthesisNode(state: State, config: ConfigArg) {
  const emit = config?.configurable?.emit;

  // 1. 运行交叉验证（规则检查 + LLM 交叉检查）
  emit?.({
    type: "status",
    agent: "cross-check",
    message: "正在进行跨 Agent 交叉验证…",
  });

  let crossChecks: Record<string, CrossCheckResult> = {};
  try {
    crossChecks = await runCrossChecks(state.resources);
  } catch (err) {
    console.error("Cross-check failed:", err);
  }

  // 将 crossCheck 结果附加到对应的 resource 上
  const checkedResources = state.resources.map((r) => {
    const check = crossChecks[r.id];
    if (check) {
      return { ...r, crossCheck: check };
    }
    return r;
  });

  // 2. 生成综合摘要
  emit?.({
    type: "status",
    agent: "synthesis",
    message: "综合摘要智能体正在生成学习导览…",
  });

  let synthesisResource: GeneratedResource | null = null;
  try {
    synthesisResource = await generateSynthesis({
      profile: state.profile!,
      primaryTopic: state.primaryTopic,
      resources: checkedResources,
      agentContext: state.agentContext,
      emit,
    });
  } catch (err) {
    emit?.({
      type: "error",
      message: `学习导览生成失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const result: Partial<State> = {
    crossChecks,
  };
  if (synthesisResource) {
    result.resources = [synthesisResource];
  }
  return result;
}

/** 构建并编译编排图（单例） */
function buildLearningGraph() {
  const graph = new StateGraph(LearningGraphState)
    .addNode("profile_builder", profileNode)
    .addNode("path_planner", plannerNode)
    .addNode("doc_gen", makeResourceNode("doc"))
    .addNode("quiz_gen", makeResourceNode("quiz"))
    .addNode("mindmap_gen", makeResourceNode("mindmap"))
    .addNode("video_gen", makeResourceNode("video"))
    .addNode("code_gen", makeResourceNode("code"))
    .addNode("reading_gen", makeResourceNode("reading"))
    .addNode("synthesis_agent", synthesisNode)
    .addEdge(START, "profile_builder")
    .addEdge("profile_builder", "path_planner")
    // 并行分发到 6 个资源 Agent
    .addEdge("path_planner", "doc_gen")
    .addEdge("path_planner", "quiz_gen")
    .addEdge("path_planner", "mindmap_gen")
    .addEdge("path_planner", "video_gen")
    .addEdge("path_planner", "code_gen")
    .addEdge("path_planner", "reading_gen")
    // 6 个 Agent 全部汇聚到 synthesis_agent
    .addEdge("doc_gen", "synthesis_agent")
    .addEdge("quiz_gen", "synthesis_agent")
    .addEdge("mindmap_gen", "synthesis_agent")
    .addEdge("video_gen", "synthesis_agent")
    .addEdge("code_gen", "synthesis_agent")
    .addEdge("reading_gen", "synthesis_agent")
    // synthesis → END
    .addEdge("synthesis_agent", END);
  return graph.compile();
}

export const learningGraph = buildLearningGraph();

/** 运行完整学习闭环，返回流式更新（streamMode: updates） */
export async function runLearningLoop(
  input: { userMessage: string },
  config: GraphConfig,
) {
  return learningGraph.stream(input, {
    streamMode: "updates",
    configurable: config.configurable,
  });
}
