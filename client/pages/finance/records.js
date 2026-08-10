const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

Page({
  data: {
    records: [],
    statusFilter: 'all',
    statusMap: {
      'pending': '审核中',
      'processing': '处理中',
      'completed': '已完成',
      'failed': '失败'
    }
  },

  onLoad() {
    this.loadRecords()
  },

  filterStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ statusFilter: status })
    this.loadRecords()
  },

  async loadRecords() {
    showLoading()
    try {
      const stuId = wx.getStorageSync('stuId')
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'getWithdrawRecords',
          data: {
            stuId,
            status: this.data.statusFilter === 'all' ? '' : this.data.statusFilter
          }
        }
      })

      if (result.code === 0) {
        this.setData({ records: result.data })
      }
    } catch (error) {
      console.error('加载提现记录失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  }
})