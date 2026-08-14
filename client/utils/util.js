const toDate = value => (value instanceof Date ? value : new Date(value))

const formatTime = date => {
  const d = toDate(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes()
  const second = d.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const formatDate = date => {
  const d = toDate(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${year}-${formatNumber(month)}-${formatNumber(day)}`
}

// ===== 商家端通用方法 =====

const formatAmount = amount => {
  if (amount === null || amount === undefined || amount === '') return '¥0.00'
  const num = Number(amount)
  if (!Number.isFinite(num)) return '¥0.00'
  const fixed = num.toFixed(2)
  const neg = fixed.charAt(0) === '-'
  const intPart = neg ? fixed.slice(1).split('.')[0] : fixed.split('.')[0]
  const decimal = fixed.split('.')[1]
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-¥' : '¥') + formatted + '.' + decimal
}

const timeAgo = date => {
  if (!date) return ''
  const now = Date.now()
  const diff = now - toDate(date).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + '分钟前'
  const hour = Math.floor(min / 60)
  if (hour < 24) return hour + '小时前'
  const day = Math.floor(hour / 24)
  if (day < 30) return day + '天前'
  return formatDate(date)
}

const ORDER_TYPE_MAP = {
  market: '二手市场',
  lostfound: '失物招领',
  help: '校园互助',
  other: '其他'
}

const PAYMENT_STATUS_MAP = {
  pending: '待支付',
  paid: '已支付',
  confirmed: '已确认'
}

const ORDER_STATUS_MAP = {
  pending: '进行中',
  completed: '已完成',
  cancelled: '已取消'
}

const WITHDRAW_STATUS_MAP = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '已失败'
}

const getOrderTypeName = type => ORDER_TYPE_MAP[type] || '其他'
const getPaymentStatusName = status => PAYMENT_STATUS_MAP[status] || status
const getOrderStatusName = status => ORDER_STATUS_MAP[status] || status
const getWithdrawStatusName = status => WITHDRAW_STATUS_MAP[status] || status

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

// 刷新未读消息角标：自定义 tabBar 不支持 wx.setTabBarBadge，
// 统一把未读数写入本地缓存，并实时更新当前页可见的 tabBar 组件
const refreshUnreadBadge = (count) => {
  const safeCount = Math.max(0, Number(count) || 0)
  wx.setStorageSync('unreadCount', safeCount)
  try {
    const pages = getCurrentPages()
    const page = pages && pages[pages.length - 1]
    if (page && typeof page.getTabBar === 'function') {
      const tabBar = page.getTabBar()
      if (tabBar) {
        tabBar.setData({ unreadCount: safeCount })
      }
    }
  } catch (error) {
    console.error('刷新未读角标失败:', error)
  }
}

// 是否为游客模式
const isGuest = () => !!wx.getStorageSync('isGuest')

// 需要微信登录的功能入口：游客弹窗引导去登录，返回 false 表示已拦截
const requireLogin = () => {
  if (!isGuest()) return true
  wx.showModal({
    title: '需要微信登录',
    content: '该功能需要微信登录并绑定手机号后才能使用，是否前往登录？',
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
  formatAmount,
  timeAgo,
  showToast,
  showLoading,
  hideLoading,
  navigateTo,
  redirectTo,
  switchTab,
  navigateBack,
  isGuest,
  requireLogin,
  refreshUnreadBadge,
  getOpenid,
  uploadImage,
  uploadImages,
  getOrderTypeName,
  getPaymentStatusName,
  getOrderStatusName,
  getWithdrawStatusName
}
