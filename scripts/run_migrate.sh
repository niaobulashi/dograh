#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$(dirname "${BASH_SOURCE[0]}")")" && pwd)"
ENV_FILE="$BASE_DIR/api/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a && . "$ENV_FILE" && set +a
fi

cd "$BASE_DIR"
# 仓库存在多个 alembic head，必须用 `upgrade heads`（复数），否则 `upgrade head`
# 在多 head 下报错中断。
exec alembic -c "$BASE_DIR/api/alembic.ini" upgrade heads
