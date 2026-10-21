@echo off
cd /d "%~dp0"
start "lunxiaoyan-flask" /MIN d:\py\Anaconda3\python.exe app.py
timeout /t 2 /nobreak >nul
start "lunxiaoyan-tunnel" /MIN "%~dp0_tools\cloudflared.exe" tunnel --url http://127.0.0.1:8080
echo Flask + Cloudflare tunnel started. Watch the tunnel window for the https://*.trycloudflare.com URL.
echo Then update PUBLIC_API_BASE in static/js/app.js, run build_pages.py, and push docs/.
pause
