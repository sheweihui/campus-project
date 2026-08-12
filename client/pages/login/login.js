Page({
  data: {
    loading: false,
    step: 'phone',       // 'phone' | 'profile'
    avatarUrl: '',       // 微信头像临时路径
    name: '',            // 真实姓名
    stuId: '',           // 学号
    phone: ''            // 已获取的手机号
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

  // Step 1: 微信手机号授权
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

          // 进入完善资料步骤（不直接跳首页）
          this.setData({
            loading: false,
            step: 'profile',
            phone: phone || ''
          })
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

  // Step 2: 选择微信头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    if (avatarUrl) {
      this.setData({ avatarUrl })
    }
  },

  // Step 2: 输入姓名/学号
  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  // Step 2: 提交完善资料
  async submitProfile() {
    const { name, stuId, avatarUrl, phone } = this.data

    // 校验
    if (!name.trim()) {
      wx.showToast({ title: '请输入真实姓名', icon: 'none' })
      return
    }
    if (!stuId.trim()) {
      wx.showToast({ title: '请输入学号', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      let finalAvatarUrl = ''

      // 上传头像到云存储（如果有选择头像）
      if (avatarUrl) {
        try {
          const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: avatarUrl
          })
          finalAvatarUrl = uploadRes.fileID
        } catch (uploadErr) {
          console.error('头像上传失败:', uploadErr)
          // 头像上传失败不阻塞注册流程
        }
      }

      // 保存到数据库
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'update',
          data: {
            name: name.trim(),
            stuId: stuId.trim(),
            phone,
            avatarUrl: finalAvatarUrl || undefined
          }
        }
      })

      if (result.code !== 0) {
        wx.showToast({ title: result.msg || '保存失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      // 更新本地存储
      const userInfo = {
        name: name.trim(),
        stuId: stuId.trim(),
        phone,
        nickName: name.trim(),
        avatarUrl: finalAvatarUrl
      }
      wx.setStorageSync('userInfo', userInfo)

      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 800)
    } catch (error) {
      console.error('完善资料失败:', error)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳过完善资料
  skipProfile() {
    const { phone } = this.data
    const userInfo = {
      phone,
      nickName: `用户${phone.slice(-4)}`,
      name: '',
      stuId: '',
      avatarUrl: ''
    }
    wx.setStorageSync('userInfo', userInfo)
    wx.showToast({ title: '可稍后在"我的"中完善', icon: 'none' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 800)
  },

  // 返回手机号授权步骤
  goBackToPhone() {
    this.setData({
      step: 'phone',
      avatarUrl: '',
      name: '',
      stuId: '',
      loading: false
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
