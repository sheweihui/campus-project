const { showLoading, hideLoading, showToast, navigateTo, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    finance: null,  //初始状态
    withdrawStatusMap: {
      'pending': '审核中',
      'processing': '处理中',
      'completed': '已完成',
      'failed': '失败'
    }
  },

  onLoad() {
    this.loadFinance()
  },

  onShow() {
    this.loadFinance()
  },

  async loadFinance() {
    showLoading()
    try {
      const stuId = wx.getStorageSync('stuId')
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'getFinance',
          data: { stuId }
        }
      })

      if (result.code === 0) {
        this.setData({ finance: result.data })
      }
    } catch (error) {
      console.error('加载财务信息失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  goToWithdraw() {
    if (!requireLogin()) return

    if (!this.data.finance || this.data.finance.availableAmount < 1) {
      showToast('可提现金额不足')
      return
    }

    navigateTo('/pages/finance/withdraw')
  },

  goToRecords() {
    if (!requireLogin()) return
    navigateTo('/pages/finance/records')
  }
})
