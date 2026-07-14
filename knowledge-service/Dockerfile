# 知识库微服务 Dockerfile
# 讯飞星火知识库模式，极简部署
# 构建：docker build -t knowledge-service .
# 运行：docker run -p 8000:8000 knowledge-service

FROM python:3.12-slim AS runner
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
