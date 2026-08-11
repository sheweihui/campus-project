Page({
  data: {
    loading: false
  },

  onLoad() {
    this.checkAutoLogin()
  },

  onShow() {
    this.checkAutoLogin()
  },

  checkAutoLogin() {
    const userInfo = wx.getStorageSync('userInfo')
    const isGuest = wx.getStorageSync('isGuest')
    
    // 已登录（微信/手机号）或游客都直接进入
    if (userInfo || isGuest) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  // 微信手机号一键登录
  onGetPhoneNumber(e) {
    if (this.data.loading) return

    const errMsg = e.detail && e.detail.errMsg
    if (errMsg && errMsg.indexOf('ok') === -1) {
      if (errMsg.indexOf('frequently') > -1) {
        wx.showToast({ title: '操作太频繁，请稍后再试', icon: 'none' })
      } else if (errMsg.indexOf('fail') === -1) {
        wx.showToast({ title: '已取消授权', icon: 'none' })
      }
      return
    }

    const code = e.detail && e.detail.code
    if (!code) {
      wx.showToast({ title: '授权失败，请重试', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'loginByPhone',
        data: { code }
      },
      success: (res) => {
        const result = res.result
        if (result.code === 0) {
          const { openid, phone } = result.data
          wx.setStorageSync('openid', openid)
          wx.removeStorageSync('isGuest')
          wx.setStorageSync('userInfo', {
            openid,
            phone,
            nickName: `用户${phone.slice(-4)}`
          })
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800)
        } else {
          wx.showToast({ title: result.msg || '登录失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '网络异常', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  guestLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    // 游客同样尝试获取 openid（用于浏览与支付身份），失败也不阻塞浏览
    wx.cloud.callFunction({
      name: 'user',
      data: { action: 'login', data: {} },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data && res.result.data.openid) {
          wx.setStorageSync('openid', res.result.data.openid)
        }
      },
      fail: (err) => {
        console.error('游客获取openid失败:', err)
      },
      complete: () => {
        wx.setStorageSync('isGuest', true)
        wx.setStorageSync('userInfo', { name: '游客', isGuest: true })
        this.setData({ loading: false })
        wx.showToast({ title: '游客登录成功', icon: 'success' })
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800)
      }
    })
  }
})
