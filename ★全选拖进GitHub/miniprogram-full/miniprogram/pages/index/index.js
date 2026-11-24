const api = require('../../services/api.js');
const config = require('../../utils/config.js');

Page({
  data: {
    alias: '',
    server: '',
    health: null,
    checked: false
  },

  onShow() {
    this.setData({
      alias: config.getAlias(),
      server: config.getBaseUrl()
    });
    this.checkServer();
  },

  async checkServer() {
    try {
      const h = await api.health();
      this.setData({ health: h, checked: true });
    } catch (e) {
      this.setData({ health: null, checked: true });
    }
  },

  goTab(e) {
    wx.switchTab({ url: e.currentTarget.dataset.url });
  },

  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  }
});
