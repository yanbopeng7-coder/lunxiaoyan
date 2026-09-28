@echo off
chcp 65001 >nul
title lunxiaoyan
cd /d "%~dp0"

set "PY="
if exist "d:\py\Anaconda3\python.exe" set "PY=d:\py\Anaconda3\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"
if not defined PY (
  echo 未找到 Python，请先安装 Anaconda 或 Python 3。
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction Stop | Select-Object -First 1; if ($c) { exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel%==0 (
  echo 服务已在运行，正在打开浏览器...
  start "" "http://127.0.0.1:8080"
  goto :eof
)

echo 正在启动论小研：http://127.0.0.1:8080
echo 请保持本窗口不要关闭，关掉窗口页面就会打不开。
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8080"
%PY% app.py
if errorlevel 1 pause
