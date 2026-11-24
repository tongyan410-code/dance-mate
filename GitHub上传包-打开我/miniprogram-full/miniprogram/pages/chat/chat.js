const api = require('../../services/api.js');

const QUICK = [
  '动作总是记不住怎么办？',
  '动作衔接怎么练？',
  '重心要注意什么？',
  '节奏和音乐怎么配合？'
];

Page({
  data: {
    messages: [],
    input: '',
    sending: false,
    quick: QUICK,
    lastId: ''
  },

  onLoad() {
    this.setData({
      messages: [{
        role: 'assistant',
        content: '你好，我是舞伴智练的 AI 陪伴助手。我可以陪你聊动作怎么记、怎么练，也能回答现代舞的小知识。具体的动作名称和标准，还是要以你的老师讲的为准哦。'
      }],
      lastId: 'msg-0'
    });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  askQuick(e) {
    this.setData({ input: e.currentTarget.dataset.q }, () => this.send());
  },

  async send() {
    const text = (this.data.input || '').trim();
    if (!text || this.data.sending) return;

    const messages = this.data.messages.concat([{ role: 'user', content: text }]);
    this.setData({
      messages,
      input: '',
      sending: true,
      lastId: 'msg-' + (messages.length - 1)
    });

    let reply;
    try {
      const history = messages.slice(-7, -1).map((m) => ({ role: m.role, content: m.content }));
      const res = await api.chat(text, history);
      reply = res.answer || '我暂时不知道怎么回答，这个问题可以问老师。';
    } catch (e) {
      reply = '抱歉，刚才没连上服务，请检查网络后重试。';
    }
    const next = messages.concat([{ role: 'assistant', content: reply }]);
    this.setData({
      messages: next,
      sending: false,
      lastId: 'msg-' + (next.length - 1)
    });
  },

  clearChat() {
    wx.showModal({
      title: '清空聊天？',
      content: '只清空这台手机上的聊天记录。',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ messages: [], lastId: '' });
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  }
});
