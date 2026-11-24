const api = require('../../services/api.js');
const config = require('../../utils/config.js');

Page({
  data: {
    id: '',
    comparison: null,
    loading: true,
    error: '',
    refVideo: '',
    pracVideo: '',
    refPoster: '',
    pracPoster: '',
    startSec: 0
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  async onShow() {
    await this.load();
  },

  async load() {
    const records = wx.getStorageSync('practiceRecords') || [];
    const record = records.find((r) => r.id === this.data.id);
    if (!record) {
      this.setData({ loading: false, error: '没找到这条练习记录。' });
      return;
    }
    try {
      let c;
      if (record.comparisonId) {
        c = await api.getComparison(record.comparisonId);
      } else {
        c = await api.createComparison({
          courseId: record.courseId,
          segmentId: record.segmentId,
          practiceJobId: record.id
        });
        record.comparisonId = c.comparison_id;
        wx.setStorageSync('practiceRecords', records);
      }
      // getComparison 不返回片段名，从本机记录补上
      if (!c.segment_title && record.segmentTitle) {
        c.segment_title = record.segmentTitle;
      }
      this.setData({
        comparison: c,
        refVideo: config.absUrl(c.reference_video_url || ('/api/vision/jobs/' + c.reference_job_id + '/video')),
        pracVideo: config.absUrl(c.practice_video_url || ('/api/vision/jobs/' + c.practice_job_id + '/video')),
        refPoster: config.absUrl(c.reference_contact_sheet_url || ('/api/vision/jobs/' + c.reference_job_id + '/contact-sheet')),
        pracPoster: config.absUrl(c.practice_contact_sheet_url || ('/api/vision/jobs/' + c.practice_job_id + '/contact-sheet')),
        startSec: Math.floor((c.segment_start_ms || 0) / 1000),
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false, error: '生成对照失败，请稍后重试。' });
    }
  },

  openPoster(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: [url] });
  },

  goChat() {
    wx.navigateTo({ url: '/pages/chat/chat' });
  }
});
