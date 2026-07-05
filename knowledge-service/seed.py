"""种子数据导入脚本

首次启动时运行，将 knowledge_base/ 目录下的所有 Markdown 文件导入 Chroma。

用法：
    python seed.py                    # 导入默认 knowledge_base/ 目录
    python seed.py --dir /path/to/kb  # 导入指定目录
    python seed.py --clear            # 导入前清空已有数据
"""

import argparse
import logging
import os
import sys

# 确保 knowledge-service/app 在 sys.path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("seed")

from app.core.config import KNOWLEDGE_BASE_DIR
from app.services.ingester import ingest_directory


def main():
    parser = argparse.ArgumentParser(description="Seed ChromaDB with knowledge base documents")
    parser.add_argument("--dir", default=KNOWLEDGE_BASE_DIR, help="Path to knowledge base directory")
    parser.add_argument("--clear", action="store_true", help="Clear collection before seeding")
    args = parser.parse_args()

    kb_dir = os.path.abspath(args.dir)
    if not os.path.isdir(kb_dir):
        logger.error(f"Knowledge base directory not found: {kb_dir}")
        sys.exit(1)

    logger.info(f"Seeding from: {kb_dir}")
    logger.info(f"Clear first: {args.clear}")

    result = ingest_directory(kb_dir, clear_first=args.clear)

    logger.info(f"Done. {result['ingested']} chunks from {len(result['sources'])} sources")
    if result["errors"]:
        for err in result["errors"]:
            logger.warning(f"  Error: {err}")

    # 验证
    from app.services.retriever import get_collection_stats
    stats = get_collection_stats()
    logger.info(f"Collection stats: {stats['total_chunks']} chunks, sources: {stats['sources']}")


if __name__ == "__main__":
    main()
