# 舞伴智练｜本次运行与代码验收记录

检查日期：2026-11-23  
检查对象：V2.2方向对齐整理版 ZIP 解压后的干净副本。

## 已实际完成的检查

| 检查 | 结果 | 说明 |
|---|---|---|
| ZIP 解压与文件结构 | 通过 | 能正常解压，根目录包含 README、启动说明、webapp、集成网页/后端、小程序和 docs |
| Web 知识库规则测试 | 118 PASS / 0 FAIL | `webapp/_test_kb.mjs` |
| Web 陪伴对话样例 | 脚本执行完成 | 检查规则回复、追问和安全边界；不是在线大模型测试或真实用户测试 |
| JS/MJS 语法 | 通过 | 21 个有效 JS/MJS 文件通过 `node --check`；移除了两个只有错误提示文本、且未被当前 loader 引用的损坏 no-SIMD 占位文件 |
| JSON 文件格式 | 12 个通过 | 所有项目 JSON 文件均可解析 |
| 集成网页内联 JS 语法 | 2 个脚本通过 | `miniprogram-full/server/index.html` |
| Python 语法 | 通过 | `app.py`、`vision/pose_service.py`、`tests/test_api.py` |
| FastAPI 自动化测试 | 5 passed | `python -m pytest tests/ -q`；视频分析流程在集成测试中 mock 了识别引擎 |
| FastAPI 服务启动 | 通过 | Uvicorn 可启动，首页 GET 返回 HTTP 200 |
| FastAPI 健康检查 | HTTP 200 | `/api/health` 返回 `ok: true`；本测试容器中 `vision_ready: false` |
| FastAPI AI陪伴 | 通过基础冒烟测试 | `/api/chat` 返回 `local_knowledge` 模式回答，并列出知识来源 |
| Web 静态文件 | HTTP 200 | 首页、Pose 模型文件、WASM 文件均可由本地静态服务器读取 |

## 尚未完成，不能宣称已跑通的部分

1. 本次执行环境是 Python 3.13.5，未安装 MediaPipe；网络不可用，无法安装 MediaPipe。因此集成网页健康检查中 `mediapipe_ready=false`、`model_ready=false`，真实服务端视频姿态分析尚未在本环境验收。
2. 项目 Windows 启动脚本明确要求 Python 3.12（64位）。需要在实际 Windows 电脑安装 Python 3.12，运行 `start_windows.bat`，让依赖安装和服务器模型下载完成。
3. 当前自动化后端视频闭环测试使用 mock 识别函数，不能代替真实视频识别测试。
4. 浏览器自动化访问本地 localhost 在本次受限环境被系统策略拦截，因此未完成真实浏览器 UI 自动化；需要在目标电脑手动检查页面和真实视频。
5. 尚未用真实社区中老年舞蹈爱好者开展3—5人试用；不得把模板或自动化测试写成真实用户数据。
6. 尚未验证真实手机摄像头、手机浏览器兼容性、HTTPS公网部署和微信小程序审核上线。

## 对 GitHub 的建议

- 可以把本候选包作为**代码和文档备份仓库**上传 GitHub（建议先 Private）。
- 在 Windows Python 3.12 的真实视觉流程通过前，不要把项目标记为“完整可运行/正式上线”，也不要在公开介绍中声称自动动作识别已完成验收。
- 公开前再次检查密钥、用户影像、聊天记录、数据库、邀请码和个人信息；本整理包已排除本次测试生成的数据库和缓存文件。
- 当前 `.gitignore` 忽略本地数据库、上传视频、运行结果、密钥和服务器端下载的模型文件。
