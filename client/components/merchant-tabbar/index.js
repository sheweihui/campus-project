Component({
  properties: {
    selected: {
      type: Number,
      value: 0
    }
  },
  data: {
    list: [
      { pagePath: '/pages/merchant/dashboard/dashboard', text: '概览', icon: '📊' },
      { pagePath: '/pages/merchant/orders/orders', text: '订单', icon: '📋' },
      { pagePath: '/pages/merchant/finance/finance', text: '财务', icon: '💰' },
      { pagePath: '/pages/merchant/settings/settings', text: '设置', icon: '⚙️' },
      { pagePath: '/pages/merchant/users/users', text: '发消息', icon: '✉️' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path } = e.currentTarget.dataset
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (!current || '/' + current.route === path) return
      // 用 redirectTo 替换当前页，避免页面栈无限叠加
      wx.redirectTo({ url: path })
    }
  }
})