// 多智能体编排引擎（LangGraph.js StateGraph）
// 赛题硬性要求：须明确"多智能体协同框架"。
// 本图编排 8 个角色的智能体协同完成学习闭环：
//   画像构建(profile_builder) → 路径规划(path_planner)
//      ┌→ doc_gen      ┌→ quiz_gen    ┌→ mindmap_gen   （并行分发）
//      └→ video_gen     └→ code_gen    └→ reading_gen
// 6 个资源 Agent 并行执行，产出在 resources 通道加法聚合；
// 各节点通过注入的 emit 回调把状态与流式内容实时推送到 SSE 通道。

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type {
  GeneratedResource,
  LearningPath,
  ResourceTask,
  ResourceType,
  StudentProfile,
} from "@/backend/types";
import { extractProfile } from "@/backend/agents/profile-agent";
import { planPath } from "@/backend/agents/planner-agent";
import { generateDoc } from "@/backend/agents/doc-agent";
import { generateQuiz } from "@/backend/agents/quiz-agent";
import { generateMindmap } from "@/backend/agents/mindmap-agent";
import { generateVideo } from "@/backend/agents/video-agent";
import { generateCode } from "@/backend/agents/code-agent";
import { generateReading } from "@/backend/agents/reading-agent";
import type { Emitter } from "@/backend/agents/resource-runner";

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

/** 资源节点工厂：按类型查找任务（缺失则用主主题兜底），调用对应 Agent */
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
    const resource = await GENERATORS[type](state.profile!, task, emit);
    return { resources: [resource] };
  };
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
    .addEdge(START, "profile_builder")
    .addEdge("profile_builder", "path_planner")
    // 并行分发到 6 个资源 Agent
    .addEdge("path_planner", "doc_gen")
    .addEdge("path_planner", "quiz_gen")
    .addEdge("path_planner", "mindmap_gen")
    .addEdge("path_planner", "video_gen")
    .addEdge("path_planner", "code_gen")
    .addEdge("path_planner", "reading_gen")
    // 汇聚到 END
    .addEdge("doc_gen", END)
    .addEdge("quiz_gen", END)
    .addEdge("mindmap_gen", END)
    .addEdge("video_gen", END)
    .addEdge("code_gen", END)
    .addEdge("reading_gen", END);
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
