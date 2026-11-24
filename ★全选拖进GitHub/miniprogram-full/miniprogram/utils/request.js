const config = require('./config.js');

function headers(extra) {
  const h = Object.assign({}, extra || {});
  const token = config.getToken();
  if (token) h['X-Pilot-Token'] = token;
  return h;
}

function showNetworkError() {
  wx.showToast({
    title: '连不上服务器，请检查地址和服务是否开启',
    icon: 'none',
    duration: 2500
  });
}

function request(options) {
  const { url, method = 'GET', data, timeout = 60000 } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.absUrl(url),
      method,
      data,
      timeout,
      header: headers({ 'Content-Type': 'application/json' }),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const msg = (res.data && res.data.detail) || ('请求失败（' + res.statusCode + '）');
          wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' });
          reject(new Error(String(msg)));
        }
      },
      fail(err) {
        showNetworkError();
        reject(err);
      }
    });
  });
}

function upload(options) {
  const { url, filePath, formData = {} } = options;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: config.absUrl(url),
      filePath,
      name: 'file',
      formData,
      header: headers(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let body = res.data;
          try { body = JSON.parse(res.data); } catch (e) {}
          resolve(body);
        } else {
          wx.showToast({ title: '上传失败（' + res.statusCode + '）', icon: 'none' });
          reject(new Error('upload status ' + res.statusCode));
        }
      },
      fail(err) {
        showNetworkError();
        reject(err);
      }
    });
  });
}

module.exports = { request, upload, headers };
