App({
  globalData: {
    serverUrl: '',
    pilotToken: '',
    alias: ''
  },

  onLaunch() {
    try {
      this.globalData.serverUrl = wx.getStorageSync('serverUrl') || '';
      this.globalData.pilotToken = wx.getStorageSync('pilotToken') || '';
      this.globalData.alias = wx.getStorageSync('alias') || '';
    } catch (e) {
      console.warn('读取本地配置失败', e);
    }
  }
});
