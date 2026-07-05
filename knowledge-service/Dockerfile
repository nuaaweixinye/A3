# 知识库微服务 Dockerfile
# 多阶段构建：先装依赖，再复制代码，预下载 BGE-M3 模型
# 构建：docker build -t knowledge-service .
# 运行：docker run -p 8000:8000 -v $(pwd)/chroma_db:/app/chroma_db knowledge-service

# ===== 1. 依赖层 =====
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ===== 2. 运行层 =====
FROM python:3.12-slim AS runner
WORKDIR /app

# 复制 Python 依赖
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# 复制应用代码
COPY app/ ./app/
COPY knowledge_base/ ./knowledge_base/
COPY seed.py ./seed.py

# Chroma 持久化目录（运行时通过 volume 挂载）
RUN mkdir -p /app/chroma_db

# 预下载 BGE-M3 模型（避免首次请求等待）
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3', device='cpu')" 2>/dev/null || true

ENV CHROMA_PERSIST_DIR=/app/chroma_db
ENV KNOWLEDGE_BASE_DIR=/app/knowledge_base

EXPOSE 8000

# 启动：先 seed（幂等，已导入的会跳过），再启动 FastAPI
CMD sh -c "python seed.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"
