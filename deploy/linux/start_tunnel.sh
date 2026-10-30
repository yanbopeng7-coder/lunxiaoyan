#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if command -v cloudflared >/dev/null 2>&1; then
  CF=cloudflared
elif [[ -x "$ROOT/_tools/cloudflared" ]]; then
  CF="$ROOT/_tools/cloudflared"
elif [[ -x "$ROOT/_tools/cloudflared.exe" ]]; then
  echo "这是 Linux 脚本，请下载 Linux 版 cloudflared："
  echo "  https://github.com/cloudflare/cloudflared/releases"
  exit 1
else
  echo "未找到 cloudflared。Linux 安装示例："
  echo "  curl -L -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  echo "  chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/"
  exit 1
fi

echo "正在把 http://127.0.0.1:8080 暴露为临时公网 URL …"
echo "把打印出的 https://*.trycloudflare.com 填进 static/js/app.js 的 PUBLIC_API_BASE"
exec "$CF" tunnel --url http://127.0.0.1:8080
