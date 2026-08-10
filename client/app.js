App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloudbase-d6gny18wlbad9e070',
        traceUser: true
      })
    }
    
    // 先等待登录完成，再检查未读消息
    this.forceLogin().then(() => {
      this.checkUnreadMessages()
      // 启动定时轮询（每10秒检查一次）
      this.startPolling()
    })
  },
  
  startPolling: function() {
    // 每10秒检查一次未读消息
    this.pollTimer = setInterval(() => {
      this.checkUnreadMessages()
    }, 10000)
  },
  
  stopPolling: function() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  checkUnreadMessages: async function() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      const stuId = userInfo?.stuId || wx.getStorageSync('stuId')
      
      if (!stuId) return
      
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'getUnreadCount',
          data: { stuId }
        }
      })
      
      if (res.result && res.result.code === 0) {
        const count = res.result.data.count
        if (count > 0) {
          wx.setTabBarBadge({
            index: 2,
            text: count > 99 ? '99+' : String(count)
          })
        } else {
          wx.removeTabBarBadge({ index: 2 })
        }
      }
    } catch (error) {
      console.error('检查未读消息失败:', error)
    }
  },

  forceLogin: async function() {
    try {
      // 1. 检查本地存储中是否有学号登录信息
      const stuId = wx.getStorageSync('stuId')
      const userInfo = wx.getStorageSync('userInfo')
      const openid = wx.getStorageSync('openid')
      
      // 2. 如果有学号和用户信息，说明已登录过，直接使用
      if (stuId && userInfo) {
        this.globalData.userInfo = userInfo
        this.globalData.stuId = stuId
        if (openid) {
          this.globalData.openid = openid
        }
        console.log('自动登录成功，使用本地存储的学号:', stuId)
        return
      }

      // 3. 获取微信登录凭证（用于获取 openid）
      const loginResult = await wx.login()
      if (!loginResult || !loginResult.code) {
        throw new Error('获取登录凭证失败')
      }
      console.log('获取登录凭证成功:', loginResult.code)

      // 4. 调用云函数获取 openid
      const cloudResult = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'login',
          data: { code: loginResult.code }
        }
      })
      
      if (!cloudResult || !cloudResult.result) {
        throw new Error('云函数调用失败')
      }
      
      const { result } = cloudResult
      console.log('云函数调用结果:', result)

      if (result.code === 0 && result.data && result.data.openid) {
        const newOpenid = result.data.openid
        wx.setStorageSync('openid', newOpenid)
        this.globalData.openid = newOpenid
        console.log('获取 openid 成功:', newOpenid)
      }
      
      // 如果没有学号登录信息，不做处理，等待用户去登录页面登录
      if (!stuId) {
        console.log('未检测到学号登录信息，需前往登录页面')
      }
      
    } catch (error) {
      console.error('登录检查失败:', error)
    }
  },

  getUserProfile: function() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          const existingUserInfo = wx.getStorageSync('userInfo') || {}
          const newUserInfo = {
            ...existingUserInfo,
            ...res.userInfo
          }
          wx.setStorageSync('userInfo', newUserInfo)
          this.globalData.userInfo = newUserInfo
          resolve(newUserInfo)
        },
        fail: (error) => {
          reject(error)
        }
      })
    })
  },

  globalData: {
    userInfo: null,
    openid: null,
    stuId: null
  }
})