Page({
  data: {
    records: [],
    stats: { total: 0, done: 0 },
    loading: true
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  load() {
    const records = wx.getStorageSync('practiceRecords') || [];
    const list = records.map((r) => Object.assign({}, r, {
      statusText: r.status === 'succeeded' ? '可看对照' : (r.status === 'failed' ? '失败' : '处理中'),
      timeText: new Date(r.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    }));
    this.setData({
      records: list,
      stats: {
        total: records.length,
        done: records.filter((r) => r.status === 'succeeded').length
      },
      loading: false
    });
  },

  viewCompare(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/compare/compare?id=' + id });
  }
});
