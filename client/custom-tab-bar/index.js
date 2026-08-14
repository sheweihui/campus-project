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
  lifetimes: {
    attached() {
      // 自定义 tabBar 的 pageLifetimes.show 不触发，改用定时轮询缓存
      this.syncUnread()
      this._unreadTimer = setInterval(() => {
        this.syncUnread()
      }, 3000)
    },
    detached() {
      if (this._unreadTimer) {
        clearInterval(this._unreadTimer)
        this._unreadTimer = null
      }
    }
  },
  pageLifetimes: {
    show() {
      this.syncUnread()
    }
  },
  methods: {
    // 从本地缓存同步未读数（app.js 轮询和消息页都会写这个缓存）
    syncUnread() {
      this.setData({ unreadCount: wx.getStorageSync('unreadCount') || 0 })
    },
    switchTab(e) {
      const { path } = e.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
