@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONUTF8=1"
title 舞伴智练 V1.4 本地服务

echo ================================================
echo   舞伴智练 V1.4 集成视觉识别版
echo   首次运行会自动安装依赖并下载姿态模型
echo ================================================
echo.

py -3.12 --version >nul 2>&1
if errorlevel 1 goto no_python

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] 正在创建独立 Python 3.12 环境……
  py -3.12 -m venv .venv
  if errorlevel 1 goto failed
)

".venv\Scripts\python.exe" -c "import fastapi,uvicorn,httpx,dotenv,cv2,mediapipe,multipart" >nul 2>&1
if errorlevel 1 (
  echo [2/4] 正在安装应用与视觉识别依赖，请保持网络连接……
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  if errorlevel 1 goto failed
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto failed
  ".venv\Scripts\python.exe" -c "import fastapi,uvicorn,httpx,dotenv,cv2,mediapipe,multipart" >nul 2>&1
  if errorlevel 1 goto failed
) else (
  echo [2/4] 依赖检查通过。
)

if not exist "models\pose_landmarker_lite.task" (
  echo [3/4] 正在下载人体姿态识别模型……
  if not exist "models" mkdir "models"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite/resolve/main/pose_landmarker_lite.task' -OutFile 'models\pose_landmarker_lite.task'"
  if errorlevel 1 goto model_failed
)

for %%F in ("models\pose_landmarker_lite.task") do set "MODEL_SIZE=%%~zF"
if not defined MODEL_SIZE goto model_failed
if %MODEL_SIZE% LSS 1000000 goto model_failed

echo [4/4] 启动舞伴智练……
echo.
echo 本机浏览器：http://127.0.0.1:8011
echo 手机访问：先用 ipconfig 查本机 IPv4 地址，
echo 再在小程序「我的 - 服务器设置」里填 http://那个地址:8011
echo 例如：http://192.168.1.10:8011
echo 关闭此黑色窗口会停止本地服务。
echo 现在请不要关闭此窗口。
echo.
".venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8011
pause
exit /b 0

:no_python
echo [需要你完成的一步] 当前电脑没有检测到 Python 3.12。
echo 视觉识别依赖暂不支持你之前使用的 Python 3.15 环境。
echo 请打开 Python 官方 Windows 下载页面，安装 Python 3.12（64-bit），安装时勾选 Add Python to PATH。
echo 安装完成后，重新双击本文件即可自动完成其余设置。
start "" "https://www.python.org/downloads/windows/"
pause
exit /b 1

:model_failed
echo.
echo 姿态模型自动下载失败或文件不完整。
echo 请检查网络后重新运行本文件；也可按 README 中的模型下载说明手动下载。
echo 模型文件应放在 models\pose_landmarker_lite.task
pause
exit /b 1

:failed
echo.
echo 安装或启动失败。请拍下本窗口最后20行发给ChatGPT，不要删除 .venv 或 models 文件夹。
pause
exit /b 1
