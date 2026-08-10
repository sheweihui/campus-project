const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const formatDate = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}-${formatNumber(month)}-${formatNumber(day)}`
}

const showToast = (title, icon = 'none') => {
  wx.showToast({
    title,
    icon,
    duration: 2000
  })
}

const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

const hideLoading = () => {
  wx.hideLoading()
}

const navigateTo = (url) => {
  wx.navigateTo({ url })
}

const redirectTo = (url) => {
  wx.redirectTo({ url })
}

const switchTab = (url) => {
  wx.switchTab({ url })
}

const navigateBack = (delta = 1) => {
  wx.navigateBack({ delta })
}

// 是否为游客模式
const isGuest = () => !!wx.getStorageSync('isGuest')

// 需要学号登录的功能入口：游客弹窗引导去登录，返回 false 表示已拦截
const requireLogin = () => {
  if (!isGuest()) return true
  wx.showModal({
    title: '需要登录',
    content: '该功能需要学号登录后才能使用，是否前往登录？',
    confirmText: '去登录',
    cancelText: '暂不',
    success: (res) => {
      if (res.confirm) {
        wx.removeStorageSync('isGuest')
        wx.navigateTo({ url: '/pages/login/login' })
      }
    }
  })
  return false
}

const getOpenid = async () => {
  const { result } = await wx.cloud.callFunction({
    name: 'user',
    data: { action: 'getOpenid' }
  })
  return result.openid
}

const uploadImage = async (filePath) => {
  const cloudPath = `images/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`
  const { fileID } = await wx.cloud.uploadFile({
    cloudPath,
    filePath,
    config: {
      scope: 'public'
    }
  })
  return fileID
}

const uploadImages = async (filePaths) => {
  const uploadTasks = filePaths.map(filePath => uploadImage(filePath))
  return Promise.all(uploadTasks)
}

module.exports = {
  formatTime,
  formatDate,
  showToast,
  showLoading,
  hideLoading,
  navigateTo,
  redirectTo,
  switchTab,
  navigateBack,
  isGuest,
  requireLogin,
  getOpenid,
  uploadImage,
  uploadImages
}
