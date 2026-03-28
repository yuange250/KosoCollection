#!/usr/bin/env bash
# 在开发机打包「可上传 ECS」的源码包（不含 node_modules）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/gamehistory-ecs-bundle-$(date +%Y%m%d).tar.gz"
cd "$ROOT"
tar -czvf "$OUT" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='local-data' \
  .
echo "已生成: $OUT"
echo "上传到服务器后: tar -xzf $(basename "$OUT") && cd GameHistory  # 目录名以实际为准"
echo "然后: chmod +x deploy/install-ecs.sh && ./deploy/install-ecs.sh"
