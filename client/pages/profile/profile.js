const { showLoading, hideLoading, navigateTo, isGuest, requireLogin, refreshUnreadBadge } = require('../../utils/util.js')

Page({
  data: {
    userInfo: {},
    isGuest: false,
    isAdmin: false,
    stats: {
      lostfound: 0,
      market: 0,
      help: 0,
      unreadMessages: 0
    }
  },

  onLoad() {
    this.loadUserInfo()
    this.loadStats()
    this.checkAdmin()
  },

  // 检查是否商家端管理员
  async checkAdmin() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'checkAdmin' }
      })
      this.setData({ isAdmin: !!(result && result.code === 0) })
    } catch (error) {
      this.setData({ isAdmin: false })
    }
  },

  // 进入商家管理后台
  goToMerchant() {
    navigateTo('/pages/merchant/dashboard/dashboard')
  },

  async onShow() {
    this.setData({ isGuest: isGuest() })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    await this.loadUserInfo()
    await this.loadStats()
    await this.checkUnreadMessages()
    this.startUnreadSync()
  },

  onHide() {
    this.stopUnreadSync()
  },

  onUnload() {
    this.stopUnreadSync()
  },

  // 与底部 tab 角标同源：定时读取本地缓存 unreadCount（app.js 每 10 秒写入真实值），
  // 保证「消息通知」红点与「我的」tab 角标同步出现/消失，而不是只在 onShow 刷新一次
  startUnreadSync() {
    this.stopUnreadSync()
    this.syncUnreadFromCache()
    this._unreadTimer = setInterval(() => {
      this.syncUnreadFromCache()
    }, 3000)
  },

  stopUnreadSync() {
    if (this._unreadTimer) {
      clearInterval(this._unreadTimer)
      this._unreadTimer = null
    }
  },

  syncUnreadFromCache() {
    const count = Math.max(0, Number(wx.getStorageSync('unreadCount')) || 0)
    if (count !== this.data.stats.unreadMessages) {
      this.setData({ 'stats.unreadMessages': count })
    }
  },

  async checkUnreadMessages() {
    try {
      const openid = wx.getStorageSync('openid')
      
      if (!openid) {
        console.log('没有用户信息，跳过检查')
        refreshUnreadBadge(0)
        this.setData({ 'stats.unreadMessages': 0 })
        return
      }
      
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'getUnreadCount',
          data: { openid }
        }
      })
      
      console.log('云函数返回:', res)
      
      if (res.result && res.result.code === 0) {
        const count = res.result.data.count
        console.log('未读消息数:', count)
        
        // 更新 stats.unreadMessages
        this.setData({ 'stats.unreadMessages': count })
        
        refreshUnreadBadge(count)
      } else {
        console.log('云函数返回错误:', res.result)
      }
    } catch (error) {
      console.error('检查未读消息失败:', error)
    }
  },

  async loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    this.setData({
      userInfo: userInfo || { name: '游客' }
    })
  },

  async loadStats() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'getStats',
          data: {}
        }
      })

      if (result.code === 0) {
        this.setData({
          stats: result.data
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  editAvatar() {
    if (!requireLogin()) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadAvatar(tempFilePath)
      }
    })
  },

  async uploadAvatar(filePath) {
    showLoading('上传中...')
    try {
      const { fileID } = await wx.cloud.uploadFile({
        cloudPath: `avatars/${Date.now()}.jpg`,
        filePath
      })

      const userInfo = this.data.userInfo
      userInfo.avatarUrl = fileID
      wx.setStorageSync('userInfo', userInfo)
      this.setData({
        userInfo
      })

      await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'update',
          data: { avatarUrl: fileID }
        }
      })

      hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (error) {
      hideLoading()
      console.error('上传头像失败:', error)
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  goToEdit() {
    if (!requireLogin()) return
    navigateTo('/pages/profile/edit')
  },

  goToMyPosts(e) {
    if (!requireLogin()) return
    const type = e.currentTarget.dataset.type
    if (type === 'lostfound') {
      navigateTo('/pages/lostfound/mylist')
    } else if (type === 'market') {
      navigateTo('/pages/market/mylist')
    } else if (type === 'help') {
      // 互助没有独立列表页，跳转到“我的发布”并切到互助 tab
      navigateTo('/pages/profile/myposts?tab=help')
    }
  },

  goToFinance() {
    if (!requireLogin()) return
    navigateTo('/pages/finance/finance')
  },

  goToMyPostsCenter() {
    if (!requireLogin()) return
    navigateTo('/pages/profile/myposts')
  },

  goToMessages() {
    if (!requireLogin()) return
    navigateTo('/pages/profile/messages')
  },

  goLogin() {
    // 退出游客模式，前往学号登录
    wx.removeStorageSync('isGuest')
    navigateTo('/pages/login/login')
  },

  goToSettings() {
    navigateTo('/pages/profile/settings')
  },

  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：15940995665\n工作时间：9:00-18:00',
      showCancel: false
    })
  }
})
