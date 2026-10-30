# 论小研 · Linux 服务器部署（学校机可用）

学校服务器是 **Linux 完全可以**。把 Flask + 密钥放在服务器上 7×24 跑，评委就不用依赖你的笔记本。

## 需要的权限

- 能 SSH 登录
- 能访问外网（调智谱等 API）
- 能监听一个端口（如 8080），或能跑 `cloudflared` 出网隧道

## 一键步骤

```bash
# 1. 上传代码到服务器后
cd /path/to/lunxiaoyan
cp .env.example .env
nano .env   # 只填 ZHIPU_API_KEY 等，不要提交 .env

# 2. Python3 + 依赖
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. 启动 API（前台试跑）
bash deploy/linux/start_api.sh

# 4. 另开一个终端开隧道（若学校没有公网 IP/域名）
bash deploy/linux/start_tunnel.sh
# 记下输出的 https://xxxx.trycloudflare.com
```

把该 `https://xxxx.trycloudflare.com` 写进本机仓库的 `static/js/app.js` 里 `PUBLIC_API_BASE`，再执行：

```bash
python3 build_pages.py
# 然后推送 docs/ 到 GitHub（或用 Contents API）
```

## systemd（可选，开机自启）

见 `lunxiaoyan-api.service` 示例。隧道若用临时域名，断线后地址会变，更稳的做法是：

- 学校给固定域名 + Nginx 反代到 `127.0.0.1:8080`，或
- Cloudflare **Named Tunnel**（需 CF 账号登录一次）

## 和 Windows 本机的区别

| | Windows 笔记本 | Linux 学校服务器 |
|---|---|---|
| 系统 | 可以 | **可以（推荐评委期）** |
| 命令 | `start_public_api.bat` | `deploy/linux/start_*.sh` |
| 风险 | 关机/休眠断线 | 一般更稳 |

我这边**无法直接登录你的学校机**；你把 SSH 配好后按本文执行即可。
