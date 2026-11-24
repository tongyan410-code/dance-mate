const api = require('../../services/api.js');
const config = require('../../utils/config.js');

function fmtTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return s + ' 秒';
}

Page({
  data: {
    courseId: '',
    course: null,
    segments: [],
    loading: true,
    error: '',
    uploading: false
  },

  onLoad(options) {
    this.setData({ courseId: options.courseId || '' });
  },

  onShow() {
    this.loadCourse();
  },

  async loadCourse() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.listCourses();
      const list = (res && res.courses) || [];
      const course = list.find((c) => c.course_id === this.data.courseId);
      if (!course) {
        this.setData({ loading: false, error: '没找到这门课，可能已被删除。' });
        return;
      }
      const segments = (course.segments || []).map((s) => Object.assign({}, s, {
        timeText: fmtTime(s.start_ms) + ' — ' + fmtTime(s.end_ms),
        poster: config.absUrl('/api/vision/jobs/' + s.reference_job_id + '/contact-sheet')
      }));
      this.setData({ course, segments, loading: false });
    } catch (e) {
      this.setData({ loading: false, error: '加载失败，请检查服务器。' });
    }
  },

  startPractice(e) {
    const seg = e.currentTarget.dataset.seg;
    if (!seg) return;
    wx.showModal({
      title: '拍摄须知',
      content: '请固定手机、全身和双脚入镜、光线均匀；教师示范和你的练习尽量用同样的方向和机位。视频 10—30 秒。上传即表示拍摄者已知情同意用于本次学习分析。',
      confirmText: '知道了，去选视频',
      success: (r) => {
        if (r.confirm) this.chooseVideo(seg);
      }
    });
  },

  chooseVideo(seg) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['camera', 'album'],
      maxDuration: 60,
      sizeType: ['original'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) {
          wx.showToast({ title: '视频超过100MB，请剪短一些', icon: 'none' });
          return;
        }
        this.uploadVideo(seg, file.tempFilePath);
      },
      fail: () => {}
    });
  },

  async uploadVideo(seg, filePath) {
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中，请稍候' });
    try {
      const res = await api.uploadPractice({
        filePath,
        courseId: this.data.courseId,
        segmentId: seg.segment_id,
        alias: config.getAlias() || '学员'
      });
      const records = wx.getStorageSync('practiceRecords') || [];
      records.unshift({
        id: res.job_id,
        courseId: this.data.courseId,
        courseTitle: (this.data.course && this.data.course.title) || '',
        segmentId: seg.segment_id,
        segmentTitle: seg.title,
        referenceJobId: seg.reference_job_id,
        createdAt: Date.now(),
        status: 'pending'
      });
      wx.setStorageSync('practiceRecords', records.slice(0, 50));
      wx.hideLoading();
      wx.showToast({ title: '已上传，正在分析', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/practice/practice' }), 800);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  openPoster(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url] });
  }
});
