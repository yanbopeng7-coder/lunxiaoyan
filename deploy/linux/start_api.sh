#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
export FLASK_ENV="${FLASK_ENV:-production}"
# 绑定本机，由 Nginx / cloudflared 对外
exec python3 app.py
