// 舞伴智练 - 浏览器本地 AI 舞蹈动作对照
// 所有姿态识别都在用户浏览器内完成，视频不上传。

import { FilesetResolver, PoseLandmarker, DrawingUtils } from "./vendor/tasks-vision.mjs";
import { buildReply, createSession, GREETING, getSuggestions } from "./companion.js";
import { computeFeedback } from "./diff.js";

// 本地 WASM 运行时路径（模型与运行时都已放在本站，不依赖外部服务）
const LOCAL_WASM = "./wasm";

// ---------- 全局状态 ----------
let landmarker = null;
let runningMode = "VIDEO";
const videos = {
  ref:  { url: null, skeletonFrames: [], landmarkFrames: [], duration: 0, width: 0, height: 0 },
  prac: { url: null, skeletonFrames: [], landmarkFrames: [], duration: 0, width: 0, height: 0 }
};
let lastVideoTime = { ref: -1, prac: -1 };
let compareAnim = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordStream = null;

// 33 个人体关键点的骨架连接（MediaPipe Pose 标准）
const POSE_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[27,29],[29,31],[27,31],
  [24,26],[26,28],[28,30],[30,32],[28,32]
];

// ---------- 初始化模型 ----------
async function initModel() {
  const bar = document.getElementById('bootBar');
  const msg = document.getElementById('bootMsg');
  try {
    setProgress(bar, msg, 15, '正在加载 AI 运行库…');
    let vision;
    try {
      // 优先用本地文件，加载更快也更稳
      vision = await FilesetResolver.forVisionTasks(LOCAL_WASM);
    } catch (localErr) {
      console.warn('本地 WASM 加载失败，改用 CDN', localErr);
      vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
      );
    }
    setProgress(bar, msg, 55, '正在加载姿态识别模型…');
    const options = {
      baseOptions: {
        modelAssetPath: "./models/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: runningMode,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, options);
    } catch (gpuErr) {
      // 手机 / 微信内置浏览器常不支持 WebGL，GPU 失败自动降级 CPU
      console.warn('GPU 加速不可用，自动切换到 CPU 模式', gpuErr);
      setProgress(bar, msg, 75, '正在切换兼容模式…');
      options.baseOptions.delegate = "CPU";
      landmarker = await PoseLandmarker.createFromOptions(vision, options);
    }
    setProgress(bar, msg, 100, '就绪！');
    document.getElementById('modelStatus').className = 'model-status ready';
    document.getElementById('modelStatusText').textContent = 'AI 已就绪';
    setTimeout(enterApp, 350);
  } catch (err) {
    console.error('模型加载失败', err);
    setProgress(bar, msg, 100, '加载失败');
    document.getElementById('modelStatus').className = 'model-status error';
    document.getElementById('modelStatusText').textContent = 'AI 未就绪';
    document.getElementById('bootRetry').style.display = 'inline-block';
    document.getElementById('bootSkip').style.display = 'inline-block';
    msg.innerHTML += '<br><span style="color:#C0392B;font-size:12px">' + escapeHtml(err.message || String(err)) +
      '</span><br><span style="font-size:12px">AI 识别暂时用不了，可以先看界面、用 AI 陪伴聊天。</span>';
  }
}

function enterApp() {
  document.getElementById('bootScreen').style.display = 'none';
  document.getElementById('main').style.display = 'block';
  document.getElementById('tabbar').style.display = 'flex';
}

function setProgress(bar, msg, pct, text) {
  if (bar) bar.style.width = pct + '%';
  if (msg) msg.textContent = text;
}

// ---------- 页面导航 ----------
function go(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === name);
  });
  window.scrollTo(0, 0);
  if (name === 'compare') refreshCompare();
}

// ---------- 视频选择 ----------
function handleFile(file, role) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    alert('请选择视频文件'); return;
  }
  if (file.size > 100 * 1024 * 1024) {
    alert('视频超过 100MB，请剪短一些再试'); return;
  }
  stopSkeletonLoop(role);
  const video = document.getElementById(role === 'ref' ? 'refVideo' : 'pracVideo');
  if (videos[role].url) URL.revokeObjectURL(videos[role].url);
  const url = URL.createObjectURL(file);
  videos[role].url = url;
  videos[role].skeletonFrames = [];
  videos[role].landmarkFrames = [];
  video.src = url;
  video.load();
  video.onloadedmetadata = () => {
    videos[role].duration = video.duration;
    videos[role].width = video.videoWidth;
    videos[role].height = video.videoHeight;
    const info = role === 'ref' ? 'refInfo' : 'pracInfo';
    document.getElementById(info).textContent =
      `视频时长 ${video.duration.toFixed(1)} 秒 · ${video.videoWidth}×${video.videoHeight}` +
      (video.duration > 60 ? ' · 超过60秒，识别会较慢，建议剪短' : '');
    document.getElementById(role === 'ref' ? 'refResult' : 'pracResult').style.display = 'block';
    // 预抽取关键帧骨架
    extractSkeletonFrames(role, video);
  };
}

document.getElementById('refFile').addEventListener('change', e => handleFile(e.target.files[0], 'ref'));
document.getElementById('pracFile').addEventListener('change', e => handleFile(e.target.files[0], 'prac'));

function clearVideo(role) {
  const video = document.getElementById(role === 'ref' ? 'refVideo' : 'pracVideo');
  video.pause();
  video.src = '';
  if (videos[role].url) URL.revokeObjectURL(videos[role].url);
  videos[role].url = null;
  videos[role].skeletonFrames = [];
  videos[role].landmarkFrames = [];
  document.getElementById(role === 'ref' ? 'refResult' : 'pracResult').style.display = 'none';
}

// ---------- 骨架识别与绘制 ----------
function drawSkeletonForVideo(video, canvas, landmarks) {
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || !landmarks.length) return;
  const pts = landmarks[0];
  // 连线
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = Math.max(3, Math.round(w / 220));
  ctx.lineCap = 'round';
  POSE_CONNECTIONS.forEach(([a, b]) => {
    if (!pts[a] || !pts[b]) return;
    ctx.beginPath();
    ctx.moveTo(pts[a].x * w, pts[a].y * h);
    ctx.lineTo(pts[b].x * w, pts[b].y * h);
    ctx.stroke();
  });
  // 关键点
  ctx.fillStyle = '#FF4081';
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(4, Math.round(w / 200)), 0, 2 * Math.PI);
    ctx.fill();
  });
}

// 逐帧播放时实时画骨架
function playWithSkeleton(role) {
  const video = document.getElementById(role === 'ref' ? 'refVideo' : 'pracVideo');
  const canvas = document.getElementById(role === 'ref' ? 'refCanvas' : 'pracCanvas');
  if (!landmarker || !video.src) return;
  lastVideoTime[role] = -1;
  video.currentTime = 0;
  video.play();
  const loop = () => {
    if (video.paused || video.ended) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime[role]) {
      lastVideoTime[role] = video.currentTime;
      try {
        const result = landmarker.detectForVideo(video, performance.now());
        drawSkeletonForVideo(video, canvas, result.landmarks);
      } catch (e) { console.warn('识别单帧失败', e); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopSkeletonLoop(role) {
  const video = document.getElementById(role === 'ref' ? 'refVideo' : 'pracVideo');
  if (video) video.pause();
}

// 预抽取关键帧（用于对照页的骨架关键帧展示）
async function extractSkeletonFrames(role, video) {
  if (!landmarker) return;
  const data = videos[role];
  data.skeletonFrames = [];
  data.landmarkFrames = [];
  const duration = data.duration || 0;
  if (duration <= 0) return;
  const count = Math.min(24, Math.max(4, Math.floor(duration / 1.2)));
  // 用离屏 video 抽帧，避免干扰用户正在看的画面
  const off = document.createElement('video');
  off.src = data.url;
  off.muted = true;
  off.playsInline = true;
  await new Promise(res => { off.onloadeddata = res; setTimeout(res, 3000); });
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1 || 1)) * Math.max(0.1, duration - 0.1);
    try {
      await seekVideo(off, t);
      const result = landmarker.detectForVideo(off, performance.now());
      if (result.landmarks && result.landmarks.length) {
        // 生成一张白底骨架小图
        const W = 160, H = 200;
        if (cvs.width !== W) { cvs.width = W; cvs.height = H; }
        ctx.fillStyle = '#F7FAFC';
        ctx.fillRect(0, 0, W, H);
        drawPointsTo(ctx, result.landmarks[0], W, H);
        data.skeletonFrames.push({ time: t, img: cvs.toDataURL('image/png') });
        data.landmarkFrames.push({
          time: t,
          landmarks: result.landmarks[0].map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }))
        });
      }
    } catch (e) { /* 单帧失败跳过 */ }
  }
  renderFeedback();
}

function seekVideo(video, t) {
  return new Promise((resolve, reject) => {
    const onSeek = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => { video.removeEventListener('seeked', onSeek); video.removeEventListener('error', onErr); };
    video.addEventListener('seeked', onSeek);
    video.addEventListener('error', onErr);
    video.currentTime = t;
    setTimeout(() => { cleanup(); resolve(); }, 1200); // 兜底
  });
}

function drawPointsTo(ctx, pts, W, H) {
  if (!pts) return;
  ctx.strokeStyle = '#2B6CB0';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  POSE_CONNECTIONS.forEach(([a, b]) => {
    if (!pts[a] || !pts[b]) return;
    ctx.beginPath();
    ctx.moveTo(pts[a].x * W, pts[a].y * H);
    ctx.lineTo(pts[b].x * W, pts[b].y * H);
    ctx.stroke();
  });
  ctx.fillStyle = '#E07B39';
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 2.5, 0, 2 * Math.PI); ctx.fill(); });
}

// ---------- 对照 ----------
// 动作反馈：把两段骨架的客观差异渲染成三行描述性提示（不打分、不判标准）
function renderFeedback() {
  const box = document.getElementById('feedbackBox');
  if (!box) return;
  if (!videos.ref.landmarkFrames.length || !videos.prac.landmarkFrames.length) {
    box.innerHTML = '<p class="text-sub">正在提取两段视频的骨架关键点，稍等片刻再看这里。</p>';
    return;
  }
  const fb = computeFeedback(videos.ref.landmarkFrames, videos.prac.landmarkFrames);
  let html = '';
  if (!fb.hasData) {
    html = '<p class="text-sub">' + escapeHtml(fb.reason) + '</p>';
  } else {
    fb.rows.forEach(r => {
      html += '<div class="feedback-row"><span class="feedback-label">' + escapeHtml(r.label) +
        '</span><span class="feedback-text">' + escapeHtml(r.text) + '</span></div>';
    });
  }
  html += '<p class="feedback-note">' + escapeHtml(fb.note) + '</p>';
  box.innerHTML = html;
}

function refreshCompare() {
  const hasRef = !!videos.ref.url, hasPrac = !!videos.prac.url;
  document.getElementById('compareEmpty').style.display = (hasRef && hasPrac) ? 'none' : 'block';
  document.getElementById('compareArea').style.display = (hasRef && hasPrac) ? 'block' : 'none';
  if (!hasRef || !hasPrac) return;
  renderFeedback();
  const rv = document.getElementById('cmpRefVideo');
  const pv = document.getElementById('cmpPracVideo');
  if (rv.src !== videos.ref.url) rv.src = videos.ref.url;
  if (pv.src !== videos.prac.url) pv.src = videos.prac.url;
  lastVideoTime.ref = -1; lastVideoTime.prac = -1;
  // 骨架关键帧
  const box = document.getElementById('posterCompare');
  box.innerHTML = '';
  const rf = videos.ref.skeletonFrames, pf = videos.prac.skeletonFrames;
  const n = Math.min(rf.length, pf.length);
  if (n === 0) {
    box.innerHTML = '<p class="text-sub" style="grid-column:1/-1">骨架提取中或未能识别到人体，请稍后再看或换一段视频。</p>';
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = document.createElement('img');
    a.src = rf[i].img; a.alt = '老师 ' + rf[i].time.toFixed(1) + '秒';
    a.onclick = () => showLightbox(a.src);
    const b = document.createElement('img');
    b.src = pf[i].img; b.alt = '我 ' + pf[i].time.toFixed(1) + '秒';
    b.onclick = () => showLightbox(b.src);
    box.appendChild(a); box.appendChild(b);
  }
}

function showLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').style.display = 'flex';
}

function playBoth() {
  if (!videos.ref.url || !videos.prac.url) return;
  const rv = document.getElementById('cmpRefVideo');
  const pv = document.getElementById('cmpPracVideo');
  const rc = document.getElementById('cmpRefCanvas');
  const pc = document.getElementById('cmpPracCanvas');
  rv.currentTime = 0; pv.currentTime = 0;
  lastVideoTime.ref = -1; lastVideoTime.prac = -1;
  rv.play(); pv.play();
  if (compareAnim) cancelAnimationFrame(compareAnim);
  const loop = () => {
    if (rv.paused && pv.paused) return;
    if (rv.readyState >= 2 && rv.currentTime !== lastVideoTime.ref) {
      lastVideoTime.ref = rv.currentTime;
      try {
        const r = landmarker.detectForVideo(rv, performance.now());
        drawSkeletonForVideo(rv, rc, r.landmarks);
      } catch (e) {}
    }
    if (pv.readyState >= 2 && pv.currentTime !== lastVideoTime.prac) {
      lastVideoTime.prac = pv.currentTime;
      try {
        const r = landmarker.detectForVideo(pv, performance.now());
        drawSkeletonForVideo(pv, pc, r.landmarks);
      } catch (e) {}
    }
    compareAnim = requestAnimationFrame(loop);
  };
  compareAnim = requestAnimationFrame(loop);
}

function pauseBoth() {
  document.getElementById('cmpRefVideo').pause();
  document.getElementById('cmpPracVideo').pause();
}

function replayBoth() { playBoth(); }

// ---------- 录制 ----------
async function startRecord() {
  const area = document.getElementById('recordArea');
  area.style.display = 'block';
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const live = document.getElementById('liveVideo');
    live.srcObject = recordStream;
    await live.play();
    document.getElementById('recordHint').textContent = '摄像头已开启。点「开始录制」，录 10—30 秒后点完成。';
  } catch (e) {
    document.getElementById('recordHint').textContent = '无法打开摄像头：' + (e.message || e) + '。请改用「从相册选」。';
  }
}

function toggleRecord() {
  const btn = document.getElementById('recordBtn');
  if (!recordStream) return;
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    recordedChunks = [];
    let mime = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) mime = 'video/mp4';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
    mediaRecorder = new MediaRecorder(recordStream, { mimeType: mime });
    mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mime });
      const file = new File([blob], 'my_practice.' + (mime.includes('mp4') ? 'mp4' : 'webm'), { type: mime });
      handleFile(file, 'prac');
      document.getElementById('recordHint').textContent = '录制完成，已加载到「我的练习」。';
    };
    mediaRecorder.start();
    btn.textContent = '■ 停止录制';
    btn.className = 'btn btn-ghost';
    document.getElementById('recordHint').textContent = '正在录制…再点一次停止。';
  } else {
    mediaRecorder.stop();
    btn.textContent = '● 开始录制';
    btn.className = 'btn btn-danger';
  }
}

function stopRecord() {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if (recordStream) { recordStream.getTracks().forEach(t => t.stop()); recordStream = null; }
  document.getElementById('recordBtn').textContent = '● 开始录制';
}

// ---------- AI 陪伴（本地知识库，见 companion.js） ----------
// 会话状态保存在当前页面内存里，刷新即重置；不上传、不写入任何服务器。
const companionSession = createSession();

function localAnswer(q) {
  return buildReply(q, companionSession);
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const q = (input.value || '').trim();
  if (!q) return;
  const box = document.getElementById('chatBox');
  const u = document.createElement('div'); u.className = 'msg user'; u.textContent = q;
  box.appendChild(u);
  input.value = '';
  const a = document.createElement('div'); a.className = 'msg assistant'; a.textContent = '正在想…';
  box.appendChild(a);
  box.scrollTop = box.scrollHeight;
  const reply = localAnswer(q);
  // 稍长的回复多停一会儿，像在认真想，而不是机械弹出来
  const delay = Math.min(900, 260 + reply.length * 6);
  setTimeout(() => {
    a.textContent = reply;
    box.scrollTop = box.scrollHeight;
    renderChips(getSuggestions(companionSession));
  }, delay);
}

// 把「能问什么」摆成可点的按钮：答不上来时不至于卡住，聊过之后给相关追问
function renderChips(list) {
  const box = document.getElementById('quickQ');
  if (!box || !Array.isArray(list) || !list.length) return;
  box.innerHTML = '';
  for (const q of list) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', () => ask(q));
    box.appendChild(b);
  }
}

function ask(q) { document.getElementById('chatInput').value = q; sendChat(); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- 暴露给页面内联 onclick 使用（module 作用域默认不全局） ----------
Object.assign(window, {
  enterApp, go, clearVideo, playWithSkeleton, startRecord, toggleRecord, stopRecord,
  playBoth, pauseBoth, replayBoth, ask, sendChat, showLightbox, renderFeedback
});

// 开场白统一由知识库提供，避免两处文案对不上
const firstMsg = document.querySelector('#chatBox .msg.assistant');
if (firstMsg) firstMsg.textContent = GREETING;

// ---------- 启动 ----------
initModel();
