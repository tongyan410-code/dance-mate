import { readFileSync } from 'node:fs';
import { buildReply, createSession, GREETING, getSuggestions } from './companion.js';

let PASS = 0, FAIL = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) PASS += 1;
  else { FAIL += 1; fails.push(name + (extra ? '  ||  ' + extra : '')); }
}
const s = () => createSession();
const FALLBACK_MARK = ['这句我一下没接住', '嗯…这个我不太懂', '没太明白', '这个超出我这点', '我先不猜了'];
const isFallback = r => FALLBACK_MARK.some(m => r.includes(m));

// 1) 以前几乎必然掉兜底，现在必须命中某个话题并给出实质回答
const shouldAnswer = [
  '你是谁啊', '你是真人吗', '你是 ChatGPT 吗',
  '你能回答些什么？', '你会什么', '能问你什么',
  '视频会上传吗？', '会不会泄露我的视频', '要联网吗', '断网还能用吗',
  '要收费吗', '这个要钱吗', '不用注册吧',
  '能发给别人一起用吗', '二维码能转发吗',
  '怎么保存下来', '换手机记录还在吗',
  '手机好卡，一直转圈', '微信里能打开吗', '要不要装 App',
  'AI 是怎么识别动作的', '骨架是什么', '手肘角度怎么算出来的',
  '识别准不准', '两段视频不一样长', '识别不到人怎么办',
  '古典舞和民族舞有啥区别', '零基础学哪种舞合适', '芭蕾和现代舞的区别',
  '基本功都练什么', '把杆是什么', '擦地怎么练',
  '老师说的术语听不懂', '什么叫留头',
  '压腿要注意什么', '身体硬能练开吗', '下腰压不下去',
  '转圈老站不稳', '转完头晕',
  '落地总是很重', '跳不起来怎么办',
  '核心没力气怎么办', '练一会儿就没劲了',
  '有点含胸驼背', '站姿不好看',
  '表情总是放不开', '跳的时候没感觉',
  '想考级要准备什么', '比赛怎么报名',
  '想学一支完整的舞', '有没有推荐的剧目',
  '上课跟不上进度', '缺了几次课怎么办',
  '上台忘动作了怎么办', '跳到一半断了',
  '一个动作要练几遍', '练到什么程度算会了',
  '每天练什么怎么安排', '帮我排个练习计划',
  '怎么复盘一次练习', '要不要记笔记',
  '练着练着老走神', '注意力集中不了',
  '被老师说了有点难受', '被同学笑了',
  '我这个年纪还能学吗', '成年人零基础来得及吗',
  '选什么音乐练比较好', '找不到合适的配乐',
  '想换舞种了', '要不要换个班',
  '最近没动力', '老是三分钟热度',
  '讲个笑话吧', '今天天气怎么样', '帮我算个数'
];
for (const q of shouldAnswer) {
  const sess = s();
  const r = buildReply(q, sess);
  ok('能答: ' + q, !isFallback(r) && r.length > 20 && sess.lastIntent !== null,
    'id=' + sess.lastIntent + '  r=' + r.slice(0, 36));
}

// 2) 明确边界：接住，但绝不越线
const boundary = [
  ['给我打个分吧', ['不打分']],
  ['我跳得能得多少分', ['不打分']],
  ['标准度百分之多少', ['不打分']],
  ['给这段评个分', ['不打分']],
  ['帮我诊断一下是不是拉伤', ['我不是医生', '不替你判断']],
  ['膝盖疼是不是骨折', ['我不是医生', '医生', '先停']],
  ['这个动作标准是什么样', ['听老师', '不替老师定']],
  ['告诉我第几拍抬手', ['听老师', '不替老师定']],
  ['这叫什么动作', ['听老师', '不替老师定', '不瞎猜']],
  ['帮我写篇论文', ['不代劳', '得你自己来']],
  ['你是真人', ['不是真人', '本地程序', '不联网']]
];
for (const [q, kws] of boundary) {
  const r = buildReply(q, s());
  ok('边界: ' + q, kws.some(k => r.includes(k)) && !isFallback(r), r.slice(0, 60));
}

// 3) 原有情绪接住不能被新话题盖掉
ok('情绪: 累', /累了就先放一放|不想动也没关系|不差这一天|歇一天不会退回去|不想练的时候不用勉强/.test(buildReply('今天好累不想练', s())));
ok('情绪: 泄气', /泄气|卡住|别急|很正常/.test(buildReply('练了半天没进步，有点泄气', s())));
ok('情绪: 紧张', /紧张|别扭/.test(buildReply('第一次上台好紧张', s())));
ok('道谢仍是轻轻一句', buildReply('谢谢你', s()).length < 30);

// 4) 同一话题连问不复读
const ss = s();
const r1 = buildReply('动作总是记不住怎么办', ss);
const r2 = buildReply('动作记不住啊', ss);
const r3 = buildReply('还是记不住', ss);
ok('不复读 1≠2', r1 !== r2);
ok('不复读 2≠3', r2 !== r3);
ok('不复读 有换说法提示', r2.includes('换个说法') || r3.includes('换个说法'));

// 5) 归一化：口语 / 错别字 / 繁体
ok('口语: 咋记动作', !isFallback(buildReply('咋记动作啊', s())));
ok('口语: 啥是擦地', !isFallback(buildReply('啥是擦地', s())));
ok('口语: 肿么办', !isFallback(buildReply('记不住动作肿么办', s())));
ok('繁体: 記不住動作', !isFallback(buildReply('記不住動作怎麼辦', s())));

// 6) 兜底要坦诚，并给可点方向
const sessFb = s();
const fb = buildReply('帮我查一下明天的限行尾号', sessFb);
ok('兜底坦诚', isFallback(fb) && /没联网|本地知识|不瞎编|不猜|超出|没接住/.test(fb), fb.slice(0, 60));
const sugg = getSuggestions(sessFb);
ok('建议 4 条', Array.isArray(sugg) && sugg.length === 4 && sugg.every(x => typeof x === 'string' && x.length > 3), JSON.stringify(sugg));
const s2 = s(); buildReply('动作总是记不住怎么办', s2);
const rel = getSuggestions(s2);
ok('追问贴合话题', rel.length === 4 && rel.some(x => x.includes('分段') || x.includes('慢练') || x.includes('录像')), JSON.stringify(rel));
const s3 = s(); buildReply('给我打个分吧', s3);
ok('边界后给通用方向', getSuggestions(s3).length === 4 && !getSuggestions(s3).some(x => x.includes('打分')));

// 7) 开场白把期待对齐
ok('开场白说明不联网', GREETING.includes('不联网'));
ok('开场白说明不打分', GREETING.includes('不打分'));
ok('开场白说明答不上来会直说', GREETING.includes('答不上来'));

// 8) 精确命中：打分匹配不能选错话题
const exact = [
  ['膝盖疼，压腿也下不去', 'pain'],
  ['记不住动作还老抢拍', 'memory'],
  ['给我个标准度百分比', 'no-score'],
  ['视频会上传到服务器吗', 'privacy'],
  ['你能回答什么', 'capability']
];
for (const [q, id] of exact) {
  const sess = s();
  buildReply(q, sess);
  ok('精确命中: ' + q + ' -> ' + id, sess.lastIntent === id, 'got=' + sess.lastIntent);
}

// 9) 集成一致性：改了 app.js 的 DOM 逻辑，确认模块接口与页面容器都对得上
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const comp = readFileSync(new URL('./companion.js', import.meta.url), 'utf8');
ok('companion 导出 getSuggestions', /export function getSuggestions/.test(comp));
ok('app 引入 getSuggestions', /getSuggestions/.test(app.split('\n')[4]));
ok('app 回复后刷新建议按钮', /renderChips\(getSuggestions\(companionSession\)\)/.test(app));
ok('app 定义 renderChips', /function renderChips\(list\)/.test(app));
ok('app 仍把 ask 挂到 window', /ask, sendChat/.test(app));
ok('html 有 quickQ 容器', /id="quickQ"/.test(html));
ok('html 快捷按钮 10 个', (html.match(/class="chip"/g) || []).length === 10);
ok('html 说明已对齐新口径', /答不上来会直说/.test(html));

console.log('PASS=' + PASS + '  FAIL=' + FAIL);
if (fails.length) {
  console.log('--- FAILURES ---');
  for (const f of fails) console.log(f);
}
