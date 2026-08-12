const { showLoading, hideLoading, navigateTo, isGuest, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    userInfo: {},
    isGuest: false,
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
  },

  async onShow() {
    this.setData({ isGuest: isGuest() })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    await this.loadUserInfo()
    await this.loadStats()
    await this.checkUnreadMessages()
  },

  async checkUnreadMessages() {
    try {
      const openid = wx.getStorageSync('openid')
      
      if (!openid) {
        console.log('没有用户信息，跳过检查')
        wx.removeTabBarBadge({ index: 2 })
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
        
        if (count > 0) {
          // 显示数字角标
          wx.setTabBarBadge({
            index: 2,
            text: count > 99 ? '99+' : String(count)
          })
          console.log('显示数字角标:', count)
        } else {
          wx.removeTabBarBadge({ index: 2 })
          console.log('移除角标')
        }
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
