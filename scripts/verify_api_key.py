#!/usr/bin/env python3
"""验证一个候选 API key 是否为数据库中某条记录对应的原始 key。

机制说明（见 api/utils/api_key.py）：
    raw_api_key = f"dgr_{secrets.token_urlsafe(32)}"
    key_hash    = hashlib.sha256(raw_api_key.encode()).hexdigest()  # 单向哈希，不可解密
    key_prefix  = raw_api_key[:8]

因此无法从数据库「解密」出原始 key。本脚本用于：
    当你从某处（日志/接口响应/笔记）找到一个疑似原始 key 的字符串时，
    计算它的 SHA-256 并与数据库里的 key_hash 比对，确认它是否就是原始 key。

用法：
    # 与已知哈希比对（默认比对本仓库 DB 中 id=1 的那条）
    python scripts/verify_api_key.py dgr_PecfXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

    # 指定要核对的哈希（覆盖默认值）
    TARGET_KEY_HASH=081294f30e5da4d390343cd449cbb4ab5931346ba4e036799e991ec2c48ad780 \
        python scripts/verify_api_key.py <候选key>

    # 直接连库校验：给定候选 key，查全表看是否命中任意一条
    python scripts/verify_api_key.py --db <候选key>

注意：key_hash 是单向哈希。本脚本只能「验证」一个候选 key 是否正确，
      无法从哈希反推出原始 key。
"""

import hashlib
import os
import sys

# 默认目标哈希：来自本仓库数据库 api_keys 表中 id=1 的记录
DEFAULT_TARGET_HASH = (
    "081294f30e5da4d390343cd449cbb4ab5931346ba4e036799e991ec2c48ad780"
)
DEFAULT_PREFIX = "dgr_Pecf"


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_against_target(raw: str, target_hash: str) -> bool:
    return hash_api_key(raw) == target_hash


def verify_against_db(raw: str):
    """连库查全表，看候选 key 的哈希是否命中任意一条记录。

    需要可访问的数据库连接。环境变量从 api/.env 读取（DATABASE_URL 或
    POSTGRES_*）。这里用 SQLAlchemy 的 async engine 做只读查询。
    """
    try:
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import URL
    except ImportError:
        print("[ERR] 未安装 sqlalchemy，无法连库校验。请先在 api 虚拟环境安装依赖。")
        sys.exit(2)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        user = os.getenv("POSTGRES_USER", "postgres")
        pw = os.getenv("POSTGRES_PASSWORD", "")
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = os.getenv("POSTGRES_PORT", "5432")
        db = os.getenv("POSTGRES_DB", "postgres")
        database_url = f"postgresql+psycopg://{user}:{pw}@{host}:{port}/{db}"

    target = hash_api_key(raw)
    engine = create_engine(database_url, future=True)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, name, key_prefix, is_active, archived_at "
                "FROM api_keys WHERE key_hash = :h"
            ),
            {"h": target},
        ).fetchall()

    if not rows:
        print(f"[NO MATCH] 候选 key 的哈希未命中任何记录。")
        print(f"  candidate hash = {target}")
        return
    for r in rows:
        print(f"[HIT] 命中记录 id={r[0]} name={r[1]} prefix={r[2]} "
              f"active={r[3]} archived_at={r[4]}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    use_db = "--db" in sys.argv

    if not args:
        print(__doc__)
        sys.exit(1)

    candidate = args[0]
    if not candidate.startswith("dgr_"):
        print(f"[WARN] 候选 key 不以 'dgr_' 开头，格式不符（期望 dgr_<43位随机字符>）。")

    # 前缀快速自检
    if candidate[:8] == DEFAULT_PREFIX:
        print(f"[OK] 前缀匹配：{candidate[:8]} == 已知前缀 {DEFAULT_PREFIX}")
    else:
        print(f"[INFO] 前缀不匹配：{candidate[:8]} != 已知前缀 {DEFAULT_PREFIX} "
              f"（已知前缀记录用的是 {DEFAULT_PREFIX}，这通常意味着不是同一条 key）")

    print(f"  candidate hash = {hash_api_key(candidate)}")

    if use_db:
        verify_against_db(candidate)
        return

    target = os.getenv("TARGET_KEY_HASH", DEFAULT_TARGET_HASH)
    if verify_against_target(candidate, target):
        print("[MATCH] ✅ 候选 key 的哈希与 key_hash 一致，这就是原始 API key。")
    else:
        print("[NO MATCH] ❌ 哈希不一致，候选 key 不是原始 key。")


if __name__ == "__main__":
    main()
