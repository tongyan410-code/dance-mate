const config = require('../../utils/config.js');
const api = require('../../services/api.js');

Page({
  data: {
    alias: '',
    server: '',
    joined: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.setData({
      alias: config.getAlias(),
      server: config.getBaseUrl(),
      joined: !!config.getToken()
    });
  },

  setIdentity() {
    wx.showModal({
      title: '设置昵称',
      editable: true,
      placeholderText: '例如：王阿姨',
      success: (res) => {
        if (!res.confirm) return;
        const alias = (res.detail && res.detail.content || '').trim();
        if (!alias) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '邀请码（可选）',
          editable: true,
          placeholderText: '有就填，没有留空即可',
          success: async (r2) => {
            const code = (r2.confirm && r2.detail && r2.detail.content || '').trim();
            try {
              await api.join(alias, code);
              config.setAlias(alias);
              wx.showToast({ title: '设置成功', icon: 'success' });
              this.refresh();
            } catch (e) {
              // 错误提示已由 request 统一处理
            }
          }
        });
      }
    });
  },

  setServer() {
    wx.showModal({
      title: '服务器地址',
      editable: true,
      content: config.getBaseUrl(),
      placeholderText: 'http://192.168.1.10:8011',
      success: (res) => {
        if (!res.confirm) return;
        try {
          config.setBaseUrl((res.detail && res.detail.content || '').trim());
          wx.showToast({ title: '已保存', icon: 'success' });
          this.refresh();
        } catch (e) {
          wx.showToast({ title: e.message || '地址格式不对', icon: 'none' });
        }
      }
    });
  },

  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  showPrivacy() {
    wx.showModal({
      title: '隐私说明',
      content: '你上传的视频只用于课程动作分析和学习反馈，保存在服务端私有目录，不会放到公开网址，也不会自动传给第三方大模型。你可以要求管理员删除视频和关联分析数据。录制他人影像前请先取得对方同意。',
      showCancel: false
    });
  },

  showHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '1. 先在「我的」设置昵称。\n2. 在「课程」选一门已发布课程，进入后点某个动作片段的「练习这个片段」。\n3. 按提示录制或选择 10-30 秒视频，手机固定、全身入镜。\n4. 在「练习」里看到分析完成后，点「查看对照」。\n5. 对照结果是辅助观察，不打分；动作是否标准以教师讲解为准。',
      showCancel: false
    });
  },

  clearLocal() {
    wx.showModal({
      title: '清除本机记录',
      content: '只清除这台手机上的昵称和练习记录，不会删除服务器上的视频。确定继续吗？',
      success: (res) => {
        if (!res.confirm) return;
        try { wx.clearStorageSync(); } catch (e) {}
        wx.showToast({ title: '已清除，请重新进入小程序', icon: 'none' });
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1200);
      }
    });
  }
});
