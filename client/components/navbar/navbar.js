Component({
  properties: {
    title: {
      type: String,
      value: '校园便利圈'
    },
    showBack: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 0,
    navbarHeight: 0
  },

  lifetimes: {
    attached() {
      this.getSystemInfo()
    }
  },

  methods: {
    getSystemInfo() {
      const systemInfo = wx.getSystemInfoSync()
      const statusBarHeight = systemInfo.statusBarHeight || 20
      const navbarHeight = statusBarHeight + 44

      this.setData({
        statusBarHeight,
        navbarHeight
      })
    },

    handleBack() {
      wx.navigateBack({
        fail() {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      })
    }
  }
})