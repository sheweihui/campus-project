/**
 * 格式化时间
 */
function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${min}`
}

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatAmount(amount) {
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

/**
 * 相对时间
 */
function timeAgo(date) {
  if (!date) return ''
  const now = Date.now()
  const diff = now - new Date(date).getTime()
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

/**
 * Toast 提示
 */
function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true })
}

function hideLoading() {
  wx.hideLoading()
}

/**
 * 订单类型映射
 */
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

function getOrderTypeName(type) {
  return ORDER_TYPE_MAP[type] || '其他'
}

function getPaymentStatusName(status) {
  return PAYMENT_STATUS_MAP[status] || status
}

function getOrderStatusName(status) {
  return ORDER_STATUS_MAP[status] || status
}

function getWithdrawStatusName(status) {
  return WITHDRAW_STATUS_MAP[status] || status
}

module.exports = {
  formatTime,
  formatDate,
  formatAmount,
  timeAgo,
  showToast,
  showLoading,
  hideLoading,
  getOrderTypeName,
  getPaymentStatusName,
  getOrderStatusName,
  getWithdrawStatusName
}
