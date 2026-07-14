# 知识库调用库 · knowledge-lib

讯飞星火知识库 (ChatDoc) 的 TypeScript 调用封装，零依赖，直接导入即可使用。

## 快速开始

### 方式 A：复制到主应用（推荐）

将 `src/` 目录复制到 Next.js 主应用的 `lib/knowledge/`：

```bash
cp -r src/ /path/to/nextjs/lib/knowledge/
```

```typescript
import { search, factCheck, uploadFile, listFiles } from "@/lib/knowledge";
```

### 方式 B：作为本地包引用

在 Next.js 的 `package.json` 中添加：

```json
{
  "dependencies": {
    "knowledge-lib": "file:../knowledge-lib"
  }
}
```

```typescript
import { search, factCheck, uploadFile, listFiles } from "knowledge-lib";
```

## API 接口

### search(query, topK?)

语义检索，从知识库中检索最相关的文档片段。

```typescript
const results = await search("数组的时间复杂度", 5);
// [{ id, text, source, score }, ...]
```

### factCheck(content, topic?)

事实验证，检查 LLM 生成内容中的事实声明是否与知识库一致。

```typescript
const { score, flagged, checked } = await factCheck("数组访问O(1)，插入O(n)", "数组");
// { score: 80, flagged: [...], checked: 5 }
```

### uploadFile(fileBuffer, fileName)

上传文档到知识库，支持 Markdown、PDF、PPTX 格式。

```typescript
const { fileId, fileName } = await uploadFile(buffer, "数据结构.pdf");
```

### listFiles()

获取知识库中的文件列表。

```typescript
const files = await listFiles();
```

## 配置

通过环境变量配置（可选，已有默认值）：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `SPARK_APP_ID` | `36271512` | 讯飞应用 APPID |
| `SPARK_API_SECRET` | 已内置 | 接口密钥 |
| `SPARK_KB_REPO_ID` | 已内置 | 知识库 ID |

## 文件结构

```
knowledge-lib/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts         # 统一导出入口
    ├── spark-auth.ts    # 讯飞 API 鉴权（HMAC-SHA1）
    └── spark-kb.ts      # 核心调用封装
```