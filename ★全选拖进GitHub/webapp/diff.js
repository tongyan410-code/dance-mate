// 舞伴智练 - 动作差异计算（纯函数，不依赖 DOM / 浏览器）
// 输入：每段视频预抽取的骨架关键帧 [{ time, landmarks: 33 个点 }]
// 输出：描述性的客观差异，不打分、不判定动作是否标准。
// 说明：角度、重心、轨迹都是骨架坐标算出来的几何量，不是对舞蹈动作的理解。

const IDX = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28
};
const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function valid(p) {
  return p && typeof p.x === 'number' && typeof p.y === 'number';
}

// b 为顶点的夹角，单位：度（0—180）
export function angleAt(a, b, c) {
  if (!valid(a) || !valid(b) || !valid(c)) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const d1 = Math.hypot(v1x, v1y), d2 = Math.hypot(v2x, v2y);
  if (d1 < 1e-9 || d2 < 1e-9) return null;
  let cos = (v1x * v2x + v1y * v2y) / (d1 * d2);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}

// 手肘角 = 肩—肘—腕 三点夹角；完全伸直约 180°，越弯越小
export function elbowAngle(lm, side) {
  if (!Array.isArray(lm) || lm.length < 17) return null;
  const s = side === 'left' ? IDX.L_SHOULDER : IDX.R_SHOULDER;
  const e = side === 'left' ? IDX.L_ELBOW : IDX.R_ELBOW;
  const w = side === 'left' ? IDX.L_WRIST : IDX.R_WRIST;
  return angleAt(lm[s], lm[e], lm[w]);
}

function shoulderWidth(lm) {
  if (!valid(lm[IDX.L_SHOULDER]) || !valid(lm[IDX.R_SHOULDER])) return null;
  const w = Math.abs(lm[IDX.R_SHOULDER].x - lm[IDX.L_SHOULDER].x);
  return w > 1e-9 ? w : null;
}

// 重心：髋中点相对踝中点的水平偏移，用肩宽归一化，消除身高和远近差异
export function balanceOffset(lm) {
  if (!Array.isArray(lm) || lm.length < 29) return null;
  const sw = shoulderWidth(lm);
  if (sw === null) return null;
  const hip = (lm[IDX.L_HIP].x + lm[IDX.R_HIP].x) / 2;
  const ankle = (lm[IDX.L_ANKLE].x + lm[IDX.R_ANKLE].x) / 2;
  return (hip - ankle) / sw;
}

// 两帧骨架主要关节的平均距离，用肩宽归一化
export function frameDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const sw = shoulderWidth(a);
  if (sw === null) return null;
  let sum = 0, n = 0;
  for (const i of BODY_POINTS) {
    if (!valid(a[i]) || !valid(b[i])) continue;
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    n++;
  }
  return n >= 6 ? (sum / n) / sw : null;
}

function round1(v) { return Math.round(v * 10) / 10; }

export function computeFeedback(refFrames, pracFrames) {
  const note = '以上只是骨架坐标的客观差异，不是动作评分；动作名称、方向和标准以老师讲解为准。机位、镜像、遮挡、光线都会影响数值。';
  if (!Array.isArray(refFrames) || !Array.isArray(pracFrames) || !refFrames.length || !pracFrames.length) {
    return { hasData: false, reason: '两段视频都上传并识别完成后，这里会显示手肘角度、重心位置和动作时机的客观差异。', note };
  }
  const n = Math.min(refFrames.length, pracFrames.length);
  if (n < 2) {
    return { hasData: false, reason: '可用关键帧太少，换一段稍长一点的视频再试。', note };
  }

  let elbowSum = 0, elbowN = 0;
  let balSum = 0, balN = 0;
  let distSum = 0, distN = 0, maxDist = -1, maxTime = 0;

  for (let i = 0; i < n; i++) {
    const A = refFrames[i] && refFrames[i].landmarks;
    const B = pracFrames[i] && pracFrames[i].landmarks;
    if (!A || !B) continue;
    for (const side of ['left', 'right']) {
      const ea = elbowAngle(A, side), eb = elbowAngle(B, side);
      if (ea !== null && eb !== null) { elbowSum += (eb - ea); elbowN++; }
    }
    const ba = balanceOffset(A), bb = balanceOffset(B);
    if (ba !== null && bb !== null) { balSum += (bb - ba); balN++; }
    const d = frameDistance(A, B);
    if (d !== null) {
      distSum += d; distN++;
      if (d > maxDist) { maxDist = d; maxTime = Number(refFrames[i].time) || 0; }
    }
  }

  if (!elbowN && !balN && !distN) {
    return { hasData: false, reason: '这段视频没识别到足够完整的人体关键点，换个机位或光线再试。', note };
  }

  const elbowDelta = elbowN ? elbowSum / elbowN : null;
  const balDelta = balN ? balSum / balN : null;
  const avgDist = distN ? distSum / distN : null;

  const rows = [];

  if (elbowDelta === null) {
    rows.push({ label: '手肘角度', text: '这一段没识别到完整手臂，暂时看不了手肘角度。' });
  } else if (Math.abs(elbowDelta) < 5) {
    rows.push({ label: '手肘角度', text: '手肘弯曲程度和示范接近。' });
  } else {
    const lvl = Math.abs(elbowDelta) < 15 ? '略' : '明显';
    const dir = elbowDelta > 0 ? '直一些' : '弯一些';
    rows.push({ label: '手肘角度', text: '手肘角度比示范' + lvl + dir + '，平均差约 ' + Math.round(Math.abs(elbowDelta)) + '°。' });
  }

  if (balDelta === null) {
    rows.push({ label: '重心位置', text: '这一段没识别到完整下半身，暂时看不了重心。' });
  } else if (Math.abs(balDelta) < 0.08) {
    rows.push({ label: '重心位置', text: '重心左右位置和示范接近。' });
  } else {
    const side = balDelta > 0 ? '画面右侧' : '画面左侧';
    rows.push({ label: '重心位置', text: '重心比示范略偏' + side + '，可以留意支撑脚。' });
  }

  if (avgDist === null) {
    rows.push({ label: '动作偏差', text: '这一段没能算出整体轨迹差异。' });
  } else {
    let text = avgDist < 0.18
      ? '整体动作轨迹和示范比较接近。'
      : '整体动作轨迹和示范有可见差异，可以慢放并排看。';
    if (avgDist >= 0.18 && distN > 0) {
      const where = maxTime < 0.05 ? '开头' : ('约 ' + round1(maxTime) + ' 秒处');
      text += '差异最明显在' + where + '，建议回看这一段示范。';
    }
    rows.push({ label: '动作偏差', text });
  }

  return {
    hasData: true,
    frames: n,
    metrics: { elbowDelta, balDelta, avgDist, maxTime },
    rows,
    note
  };
}
