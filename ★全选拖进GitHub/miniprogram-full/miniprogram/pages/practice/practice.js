const api = require('../../services/api.js');
const config = require('../../utils/config.js');

const STATUS_TEXT = {
  pending: '排队中',
  running: '分析中',
  succeeded: '分析完成',
  failed: '分析失败'
};

function decorate(records) {
  return records.map((r) => Object.assign({}, r, {
    statusText: STATUS_TEXT[r.status] || r.status || '未知',
    statusClass: r.status === 'succeeded' ? 'ok' : (r.status === 'failed' ? 'bad' : 'wait'),
    timeText: new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })
  }));
}

Page({
  data: {
    records: [],
    loading: true
  },

  onShow() {
    this.loadRecords();
    this.timer = setInterval(() => this.refreshStatus(), 5000);
  },

  onHide() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  onUnload() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  onPullDownRefresh() {
    this.loadRecords().then(() => wx.stopPullDownRefresh());
  },

  async loadRecords() {
    const records = wx.getStorageSync('practiceRecords') || [];
    this.setData({ records: decorate(records), loading: false });
    await this.refreshStatus();
  },

  async refreshStatus() {
    const records = wx.getStorageSync('practiceRecords') || [];
    const pending = records.filter((r) => r.status === 'pending' || r.status === 'running');
    if (!pending.length) return;
    for (const r of pending) {
      try {
        const job = await api.getJob(r.id);
        r.status = job.status;
        r.progress = job.progress;
        r.message = job.message;
        r.error = job.error;
      } catch (e) {
        // 网络异常时保留上次状态，下一轮再试
      }
    }
    wx.setStorageSync('practiceRecords', records);
    this.setData({ records: decorate(records) });
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/courses' });
  },

  viewCompare(e) {
    const id = e.currentTarget.dataset.id;
    const r = (wx.getStorageSync('practiceRecords') || []).find((x) => x.id === id);
    if (!r) return;
    if (r.status !== 'succeeded') {
      wx.showToast({ title: '分析还没完成，请稍等', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/compare/compare?id=' + r.id });
  },

  removeRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条练习？',
      content: '会同时删除服务器上的这段视频和分析结果，删除后无法恢复。',
      success: async (res) => {
        if (!res.confirm) return;
        try { await api.deleteJob(id); } catch (err) {}
        const left = (wx.getStorageSync('practiceRecords') || []).filter((x) => x.id !== id);
        wx.setStorageSync('practiceRecords', left);
        this.setData({ records: decorate(left) });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }
});
