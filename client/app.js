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
      const openid = wx.getStorageSync('openid')
      if (!openid) return
      
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'getUnreadCount',
          data: { openid }
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
      // 1. 检查本地存储中是否有登录信息（微信手机号登录）
      const userInfo = wx.getStorageSync('userInfo')
      const openid = wx.getStorageSync('openid')
      
      // 2. 已通过微信手机号登录，直接使用本地信息
      if (userInfo && !userInfo.isGuest && userInfo.phone) {
        this.globalData.userInfo = userInfo
        this.globalData.stuId = ''
        if (openid) {
          this.globalData.openid = openid
        }
        console.log('自动登录成功（微信手机号）')
        return
      }

      // 3. 游客或未绑定手机号：获取微信 openid
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
    stuId: ''
  }
})
