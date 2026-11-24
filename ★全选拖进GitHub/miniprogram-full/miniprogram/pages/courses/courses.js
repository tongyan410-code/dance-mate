const api = require('../../services/api.js');

Page({
  data: {
    courses: [],
    loading: true,
    error: ''
  },

  onShow() {
    this.loadCourses();
  },

  onPullDownRefresh() {
    this.loadCourses().then(() => wx.stopPullDownRefresh());
  },

  async loadCourses() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.listCourses();
      this.setData({ courses: (res && res.courses) || [], loading: false });
    } catch (e) {
      this.setData({ loading: false, error: '暂时读不到课程，请检查服务器。' });
    }
  },

  openCourse(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/course-detail/course-detail?courseId=' + id });
  }
});
