const { formatAmount, showToast, showLoading, hideLoading } = require('../../../utils/util.js')

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

    // 时间范围筛选
    periodFilter: 'month',
    periodLabel: '本月',
    periodTabs: [
      { key: 'today', label: '今日' },
      { key: 'month', label: '本月' },
      { key: 'all', label: '全部' }
    ],
    periodLabelMap: { today: '今日', month: '本月', all: '全部' },

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
      const params = this.buildPeriodParams(this.data.periodFilter)
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'getFinanceOverview', data: params }
      })

      if (result.code === 0) {
        const d = result.data
        this.setData({
          overview: d.overview,
          period: d.period,
          periodLabel: this.data.periodLabelMap[this.data.periodFilter] || '本期',
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

  // 构建时间范围参数（getFinanceOverview 支持 startDate/endDate，YYYY-MM-DD）
  buildPeriodParams(period) {
    const now = new Date()
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (period === 'today') {
      const today = fmt(now)
      return { startDate: today, endDate: today }
    }
    if (period === 'all') {
      return { startDate: '2000-01-01', endDate: fmt(now) }
    }
    // 本月（不传 endDate，云函数默认取到月末）
    return { startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: '' }
  },

  // 切换时间范围
  switchPeriod(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.periodFilter) return
    this.setData({ periodFilter: key })
    this.loadFinance()
  },

  // 跳转到提现管理
  goToWithdraws() {
    wx.navigateTo({ url: '/pages/merchant/withdraws/withdraws' })
  }
})
