# 知识库微服务 · Knowledge Service

> 第十五届中国软件杯 A3 赛题 — 独立知识库模块  
> 基于 **Chroma + BGE-M3 + FastAPI** 的语义检索与事实验证服务

## 功能

| API | 方法 | 说明 |
|-----|------|------|
| `/api/v1/search` | POST | 语义检索（BGE-M3 向量化 → Chroma 相似度搜索） |
| `/api/v1/fact-check` | POST | 事实验证（防幻觉第3层：抽取声明 → 回查知识库） |
| `/api/v1/ingest` | POST | 文档导入（支持 Markdown / PDF / PPTX） |
| `/api/v1/stats` | GET | 知识库统计（chunk 数、来源列表） |
| `/api/v1/health` | GET | 健康检查 |
| `/docs` | GET | Swagger UI 交互式 API 文档 |

## 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 导入种子数据（8 篇数据结构与算法课程文档）
python seed.py

# 3. 启动服务
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. 验证
curl http://localhost:8000/api/v1/health
curl -X POST http://localhost:8000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "数组的时间复杂度", "top_k": 3}'
```

## Docker 部署

```bash
docker build -t knowledge-service .
docker run -p 8000:8000 -v $(pwd)/chroma_db:/app/chroma_db knowledge-service
```

## 与主应用集成

本服务通过 REST API 被 Next.js 主应用调用。详细的集成方法见 [`开发文档.md`](./开发文档.md) 第7章。

主应用中需要本服务配合的两个文件（路径相对于 Next.js 项目根目录）：

```
lib/knowledge/retriever.ts  → 搜索适配器（调用 POST /api/v1/search）
lib/knowledge/fact-check.ts → 事实核查适配器（调用 POST /api/v1/fact-check）
```

当 `KNOWLEDGE_SERVICE_URL` 未设置或服务不可用时，自动降级到本地关键词检索。

## 技术栈

| 组件 | 技术 |
|------|------|
| Web 框架 | FastAPI |
| 向量数据库 | Chroma |
| Embedding | BAAI/bge-m3（中英双语，1024维） |
| 文档解析 | PyMuPDF (PDF) + Unstructured (PPTX) + 原生 (Markdown) |
| 分块策略 | 按 ## 标题 + 500字符滑动窗口 |

## 目录结构

```
knowledge-service/
├── app/
│   ├── main.py              # FastAPI 入口 + 生命周期
│   ├── api/                  # API 路由
│   │   ├── search.py         #   POST /api/v1/search
│   │   ├── ingest.py         #   POST /api/v1/ingest
│   │   ├── fact_check.py     #   POST /api/v1/fact-check
│   │   └── stats.py          #   GET  /api/v1/stats + /health
│   ├── core/                 # 核心能力
│   │   ├── config.py         #   环境变量配置
│   │   ├── embedding.py      #   BGE-M3 单例封装
│   │   └── chunking.py       #   文档分块策略
│   ├── models/
│   │   └── schemas.py        #   Pydantic 请求/响应模型
│   └── services/             # 业务逻辑
│       ├── retriever.py      #   Chroma 向量检索
│       ├── ingester.py       #   文档导入管道
│       └── verifier.py       #   事实核查逻辑
├── knowledge_base/           # 种子课程文档（8 篇 MD）
├── chroma_db/                # 向量库持久化目录
├── seed.py                   # 种子数据导入脚本
├── requirements.txt
├── Dockerfile
├── README.md                 # 快速开始指南（本文件）
└── 开发文档.md               # 完整开发手册（架构/API/集成/部署/FAQ）
```
