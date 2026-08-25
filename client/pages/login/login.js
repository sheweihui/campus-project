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

    // 已登录（绑定手机号）则直接回首页，未登录停在登录页
    if (userInfo && userInfo.phone) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  // 微信手机号一键登录
  getPhoneNumber(e) {
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

          // 手机号登录成功即视为登录完成（姓名/学号稍后在"我的"中完善）
          const userInfo = {
            phone: phone || '',
            nickName: '微信用户',
            name: '',
            stuId: '',
            avatarUrl: ''
          }
          wx.setStorageSync('userInfo', userInfo)
          this.setData({ loading: false })
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => {
            // 返回触发登录的页面继续原操作；无上一页则回首页
            const pages = getCurrentPages()
            if (pages.length > 1) {
              wx.navigateBack()
            } else {
              wx.switchTab({ url: '/pages/index/index' })
            }
          }, 800)
        } else {
          wx.showToast({ title: result.msg || '登录失败', icon: 'none' })
          this.setData({ loading: false })
        }
      },
      fail: () => {
        wx.showToast({ title: '网络异常', icon: 'none' })
        this.setData({ loading: false })
      }
    })
  },

})