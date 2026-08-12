Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '/tabbar/主页.png', selectedIcon: '/tabbar/主页 (1).png' },
      { pagePath: '/pages/tools/tools', text: '工具', icon: '/tabbar/工具.png', selectedIcon: '/tabbar/工具 (1).png' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: '/tabbar/我的.png', selectedIcon: '/tabbar/我的 (1).png' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path } = e.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
