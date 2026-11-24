import { buildReply, createSession, GREETING } from './companion.js';

const s = createSession();
const dialog = [
  '练了半天没什么进步，有点泄气',
  '动作总是记不住怎么办？',
  '还是记不住，怎么办',
  '膝盖有点疼',
  '嗯',
  '谢谢',
  '就是想随便聊两句',
  '第一次上台，好紧张',
  '重心老是站不稳',
  '今天有点累，不想练了',
  '随便说点啥都行吧 zzz'
];

console.log('开场白:\n' + GREETING + '\n');
const answers = [];
for (const q of dialog) {
  const a = buildReply(q, s);
  answers.push(a);
  console.log('【问】' + q);
  console.log('【答】' + a.replace(/\n/g, ' / '));
  console.log('');
}

const joined = answers.join('\n');
const banned = ['我理解您的感受', '建议您', '您可以尝试', '请您', '评分', '标准度得分'];
const hits = banned.filter(b => joined.includes(b));
console.log('=== 检查 ===');
console.log('空回复:', answers.filter(a => !a || !a.trim()).length);
console.log('禁用措辞命中:', hits.length ? hits : '无');
console.log('同一话题两次回复是否相同:', answers[1] === answers[2] ? '相同(不合格)' : '不同(OK)');
console.log('疼痛回复是否含"医生/老师/别硬撑":',
  /医生|老师|硬撑/.test(answers[3]) ? 'OK' : '缺失');
console.log('身体关怀是否出现过:', /上回你提到膝盖不舒服/.test(joined) ? 'OK' : '未触发');
console.log('情绪接住是否出现:', /泄气|烦|别急|正常/.test(answers[0]) ? 'OK' : '缺失');
