const { formatTime, formatAmount, showToast, getOrderTypeName, getPaymentStatusName } = require('../../utils/util.js')

Page({
  data: {
    order: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadDetail(options.id)
    }
  },

  async loadDetail(orderId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getOrderDetail',
          data: { orderId }
        }
      })

      if (result.code === 0) {
        this.setData({ order: result.data, loading: false })
      } else {
        showToast('订单不存在')
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (error) {
      console.error('加载订单详情失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 格式化
  formatTime,
  formatAmount,
  getOrderTypeName,
  getPaymentStatusName
})
