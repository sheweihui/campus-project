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
    const stuId = wx.getStorageSync('stuId')
    const userInfo = wx.getStorageSync('userInfo')
    
    if (stuId && userInfo) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onLogin(e) {
    const formData = e.detail.value || {}
    const stuId = formData.stuId || ''
    const name = formData.name || ''
    const phone = formData.phone || ''
    const pwd = formData.pwd || ''

    console.log('表单数据:', formData)
    console.log('姓名:', name, '长度:', name.length)

    if (!stuId.trim()) {
      wx.showToast({ title: '请输入学号', icon: 'none' })
      return
    }

    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    if (!phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }

    if (!pwd.trim()) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }

    if (!/^\d+$/.test(stuId)) {
      wx.showToast({ title: '学号必须为纯数字', icon: 'none' })
      return
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'student',
      data: {
        action: 'login',
        data: {
          stuId: stuId.trim(),
          name: name.trim(),
          phone: phone.trim(),
          pwd: pwd.trim()
        }
      },
      success: (res) => {
        const result = res.result
        if (result.code === 0) {
          wx.setStorageSync('stuId', stuId.trim())
          wx.setStorageSync('userInfo', {
            name: name.trim(),
            phone: phone.trim(),
            stuId: stuId.trim()
          })
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1500)
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
  }
})