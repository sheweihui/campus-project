const { formatAmount, showToast, showLoading, hideLoading } = require('../../../utils/util.js')

Page({
  data: {
    // KPI 指标
    kpis: {
      totalRevenue: 0,
      platformCommission: 0,
      totalOrders: 0,
      userCount: 0,
      todayOrders: 0,
      pendingWithdraws: 0,
      pendingWithdrawAmount: 0,
      completedOrders: 0,
      cancelledOrders: 0
    },
    // 分类数据
    categories: [],
    // 近30天趋势
    dailyStats: [],
    // 最近交易
    recentTransactions: [],
    // 时间筛选
    dateRange: '本月',
    loading: true
  },

  onLoad() {
    this.loadDashboard()
  },

  onShow() {
    this.loadDashboard()
  },

  onPullDownRefresh() {
    this.loadDashboard().then(() => wx.stopPullDownRefresh())
  },

  async loadDashboard() {
    showLoading('加载数据...')
    try {
      const [dashRes, dailyRes, recentRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'admin',
          data: { action: 'getDashboard' }
        }),
        wx.cloud.callFunction({
          name: 'admin',
          data: { action: 'getDailyStats', data: { days: 30 } }
        }),
        wx.cloud.callFunction({
          name: 'admin',
          data: { action: 'getRecentTransactions', data: { limit: 8 } }
        })
      ])

      if (dashRes.result && dashRes.result.code === 0) {
        const d = dashRes.result.data
        const cats = d.categoryBreakdown || {}

        this.setData({
          kpis: {
            totalRevenue: d.totalRevenue || 0,
            platformCommission: d.platformCommission || 0,
            totalOrders: d.totalOrders || 0,
            userCount: d.userCount || 0,
            todayOrders: d.todayOrders || 0,
            pendingWithdraws: d.pendingWithdraws || 0,
            pendingWithdrawAmount: d.pendingWithdrawAmount || 0,
            completedOrders: d.completedOrders || 0,
            cancelledOrders: d.cancelledOrders || 0
          },
          categories: [
            { key: 'market', name: '二手市场', icon: '🛒', count: cats.market?.count || 0, amount: cats.market?.amount || 0 },
            { key: 'lostfound', name: '失物招领', icon: '🔍', count: cats.lostfound?.count || 0, amount: cats.lostfound?.amount || 0 },
            { key: 'help', name: '校园互助', icon: '🤝', count: cats.help?.count || 0, amount: cats.help?.amount || 0 }
          ],
          loading: false
        })
      }

      if (dailyRes.result && dailyRes.result.code === 0) {
        this.setData({ dailyStats: dailyRes.result.data || [] })
        this.drawDailyChart(dailyRes.result.data || [])
      }

      if (recentRes.result && recentRes.result.code === 0) {
        this.setData({ recentTransactions: recentRes.result.data || [] })
      }
    } catch (error) {
      console.error('加载仪表盘失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    } finally {
      hideLoading()
    }
  },

  // 绘制简化柱状图（用 CSS + 动态高度实现）
  drawDailyChart(stats) {
    if (!stats || stats.length === 0) return

    const maxAmount = Math.max(...stats.map(s => s.amount || 0), 1)
    const chartData = stats.slice(-14).map(s => ({
      date: s.date.slice(5), // MM-DD
      amount: s.amount || 0,
      count: s.orderCount || 0,
      height: Math.max(4, Math.round(((s.amount || 0) / maxAmount) * 100))
    }))

    this.setData({ chartData, chartMax: maxAmount })
  },

  // 跳转到订单页
  goToOrders(e) {
    const type = e.currentTarget.dataset.type || ''
    wx.navigateTo({ url: '/pages/merchant/orders/orders' })
    if (type) {
      wx.setStorageSync('orderFilter', type)
    }
  },

  // 跳转到财务页
  goToFinance() {
    wx.navigateTo({ url: '/pages/merchant/finance/finance' })
  },

  // 跳转到用户页
  goToUsers() {
    wx.navigateTo({ url: '/pages/merchant/users/users' })
  },

  // 跳转到提现管理
  goToWithdraws() {
    wx.navigateTo({ url: '/pages/merchant/withdraws/withdraws' })
  },

  // 返回用户端
  goBackUser() {
    wx.navigateBack()
  }
})
