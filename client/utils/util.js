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
  getOpenid,
  uploadImage,
  uploadImages
}