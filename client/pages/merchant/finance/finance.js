const { formatAmount, showToast, showLoading, hideLoading } = require('../../utils/util.js')

Page({
  data: {
    overview: null,
    period: null,
    userFinanceList: [],
    recentWithdraws: [],

    // 用户财务列表分页
    financePage: 1,
    financeTotal: 0,
    hasMoreFinance: false,

    loading: true
  },

  onLoad() {
    this.loadFinance()
  },

  onShow() {
    this.loadFinance()
  },

  async loadFinance() {
    showLoading('加载财务数据...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'getFinanceOverview' }
      })

      if (result.code === 0) {
        const d = result.data
        this.setData({
          overview: d.overview,
          period: d.period,
          // 按可用余额从高到低排序，展示真正的“余额排行”
          userFinanceList: (d.userFinanceDetails || [])
            .slice()
            .sort((a, b) => (b.availableAmount || 0) - (a.availableAmount || 0))
            .slice(0, 20),
          recentWithdraws: (d.recentWithdraws || []).slice(0, 10),
          financeTotal: (d.userFinanceDetails || []).length,
          hasMoreFinance: (d.userFinanceDetails || []).length > 20,
          loading: false
        })
      }
    } catch (error) {
      console.error('加载财务数据失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    } finally {
      hideLoading()
    }
  },

  // 跳转到提现管理
  goToWithdraws() {
    wx.navigateTo({ url: '/pages/merchant/withdraws/withdraws' })
  }
})
