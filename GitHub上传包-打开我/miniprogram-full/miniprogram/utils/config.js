// 服务器地址配置。
// 默认指向本机后端；用户可在「我的 → 服务器设置」里改成局域网 IP 或公网域名，
// 改完存到本地，不需要重新发版。
const DEFAULT_BASE_URL = 'http://127.0.0.1:8011';

function getBaseUrl() {
  try {
    const app = getApp();
    if (app && app.globalData && app.globalData.serverUrl) {
      return app.globalData.serverUrl.replace(/\/+$/, '');
    }
  } catch (e) {}
  return DEFAULT_BASE_URL;
}

function setBaseUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(clean)) {
    throw new Error('地址要以 http:// 或 https:// 开头');
  }
  wx.setStorageSync('serverUrl', clean);
  const app = getApp();
  if (app && app.globalData) app.globalData.serverUrl = clean;
}

function getToken() {
  try {
    const app = getApp();
    return (app && app.globalData && app.globalData.pilotToken) || wx.getStorageSync('pilotToken') || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  wx.setStorageSync('pilotToken', token || '');
  const app = getApp();
  if (app && app.globalData) app.globalData.pilotToken = token || '';
}

function getAlias() {
  try {
    const app = getApp();
    return (app && app.globalData && app.globalData.alias) || wx.getStorageSync('alias') || '';
  } catch (e) {
    return '';
  }
}

function setAlias(alias) {
  wx.setStorageSync('alias', alias || '');
  const app = getApp();
  if (app && app.globalData) app.globalData.alias = alias || '';
}

function absUrl(path) {
  if (!path) return '';
  let url = /^https?:\/\//.test(path) ? path : getBaseUrl() + path;
  // 服务端开启邀请码后，video/image 组件无法带自定义 header，
  // 统一在 URL 上补 token 查询参数。
  const token = getToken();
  if (token && url.indexOf('/api/') >= 0 && url.indexOf('token=') < 0) {
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
  }
  return url;
}

module.exports = {
  DEFAULT_BASE_URL,
  getBaseUrl,
  setBaseUrl,
  getToken,
  setToken,
  getAlias,
  setAlias,
  absUrl
};
