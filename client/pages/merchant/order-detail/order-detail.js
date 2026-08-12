const { formatTime, formatAmount, showToast, showLoading, hideLoading, navigateBack, getOrderTypeName, getPaymentStatusName } = require('/utils/util.js')

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
  getPaymentStatusName,

  // 编辑订单
  editOrder() {
    const id = this.data.order && this.data.order._id
    if (!id) return
    wx.navigateTo({ url: '/pages/merchant/orders/order-edit?id=' + id })
  },

  // 删除订单
  deleteOrder() {
    const order = this.data.order
    if (!order) return
    wx.showModal({
      title: '确认删除',
      content: '删除后订单将从统计中移除（不影响已结算的余额），确定删除？',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return
        showLoading('删除中...')
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'admin',
            data: {
              action: 'deleteOrder',
              data: { orderId: order._id }
            }
          })
          if (result.code === 0) {
            showToast('已删除', 'success')
            setTimeout(() => navigateBack(), 1200)
          } else {
            showToast(result.msg || '删除失败')
          }
        } catch (error) {
          console.error('删除订单失败:', error)
          showToast('删除失败')
        } finally {
          hideLoading()
        }
      }
    })
  }
})
