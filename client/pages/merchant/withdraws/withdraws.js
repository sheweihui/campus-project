const { formatAmount, formatTime, showToast, showLoading, hideLoading } = require('../../../utils/util.js')

Page({
  data: {
    statusFilter: 'all',  // all, pending, processing, completed, failed
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'processing', label: '处理中' },
      { key: 'completed', label: '已完成' },
      { key: 'failed', label: '已失败' }
    ],

    withdraws: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadWithdraws()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, withdraws: [], hasMore: true })
    this.loadWithdraws().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadWithdraws(true)
    }
  },

  async loadWithdraws(loadMore = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const page = loadMore ? this.data.page + 1 : 1

    try {
      const params = { page, pageSize: this.data.pageSize }
      if (this.data.statusFilter !== 'all') {
        params.status = this.data.statusFilter
      }

      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getWithdrawList',
          data: params
        }
      })

      if (result.code === 0) {
        const list = loadMore ? [...this.data.withdraws, ...result.data.list] : result.data.list
        this.setData({
          withdraws: list,
          page,
          total: result.data.total,
          hasMore: page < result.data.totalPages,
          loading: false
        })
      } else {
        showToast(result.msg || '加载失败')
        this.setData({ loading: false })
      }
    } catch (error) {
      console.error('加载提现列表失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 切换状态筛选
  onStatusChange(e) {
    const status = e.currentTarget.dataset.key
    this.setData({ statusFilter: status, page: 1, withdraws: [], hasMore: true })
    this.loadWithdraws()
  },

  // 批准提现（人工打款后确认，可填备注）
  async approveWithdraw(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '确认批准打款',
      content: `批准 ${formatAmount(item.amount)} 打款到 ${item.realName || '用户'}？可填写打款备注。`,
      editable: true,
      placeholderText: '打款备注（选填），如：已打款尾号1234',
      confirmText: '批准打款',
      success: async (res) => {
        if (!res.confirm) return
        const remark = (res.content || '').trim()

        showLoading('处理中...')
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'admin',
            data: {
              action: 'processWithdraw',
              data: {
                financeId: item.financeId,
                partnerTradeNo: item.partnerTradeNo,
                action: 'approve',
                remark
              }
            }
          })

          if (result.code === 0) {
            showToast('已批准', 'success')
            this.loadWithdraws()
          } else {
            showToast(result.msg || '操作失败')
          }
        } catch (error) {
          showToast('操作失败')
        } finally {
          hideLoading()
        }
      }
    })
  },

  // 拒绝提现（退回余额，可填原因）
  async rejectWithdraw(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '确认拒绝提现',
      content: `拒绝 ${formatAmount(item.amount)}？金额将退回用户余额。可填写拒绝原因。`,
      editable: true,
      placeholderText: '拒绝原因（选填）',
      confirmText: '确认拒绝',
      success: async (res) => {
        if (!res.confirm) return
        const remark = (res.content || '').trim()

        showLoading('处理中...')
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'admin',
            data: {
              action: 'processWithdraw',
              data: {
                financeId: item.financeId,
                partnerTradeNo: item.partnerTradeNo,
                action: 'reject',
                remark
              }
            }
          })

          if (result.code === 0) {
            showToast('已拒绝', 'success')
            this.loadWithdraws()
          } else {
            showToast(result.msg || '操作失败')
          }
        } catch (error) {
          showToast('操作失败')
        } finally {
          hideLoading()
        }
      }
    })
  }
})
