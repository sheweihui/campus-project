Component({
  data: {
    selected: 0,
    unreadCount: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '/tabbar/主页.png', selectedIcon: '/tabbar/主页 (1).png' },
      { pagePath: '/pages/tools/tools', text: '工具', icon: '/tabbar/工具.png', selectedIcon: '/tabbar/工具 (1).png' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: '/tabbar/我的.png', selectedIcon: '/tabbar/我的 (1).png' }
    ]
  },
  pageLifetimes: {
    // 每次 tab 页显示时同步一次未读数（app.js 轮询已把最新值写入缓存）
    show() {
      this.setData({ unreadCount: wx.getStorageSync('unreadCount') || 0 })
    }
  },
  methods: {
    switchTab(e) {
      const { path } = e.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
