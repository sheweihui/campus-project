const { showLoading, hideLoading, refreshUnreadBadge } = require('../../utils/util.js')

Page({
  data: {
    currentTab: 'all',
    messageList: [],
    unreadCount: 0,
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false
  },

  onLoad() {
    this.loadData()
    this.loadUnreadCount()
  },

  async onShow() {
    // 先标记所有消息为已读，再加载数据
    await this.markAllAsRead()
    await this.loadData()
    await this.loadUnreadCount()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 })
      this.loadData(true)
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      currentTab: tab,
      page: 1,
      hasMore: true,
      messageList: []
    })
    this.loadData()
  },

  async loadUnreadCount() {
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
      
      if (res.result.code === 0) {
        this.setData({ unreadCount: res.result.data.count })
      }
    } catch (error) {
      console.error('获取未读消息数失败:', error)
    }
  },

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    
    this.setData({ isLoading: true })
    showLoading()

    try {
      const openid = wx.getStorageSync('openid')
      
      if (!openid) {
        this.setData({ messageList: [], hasMore: false })
        return
      }
      
      // 使用云函数查询消息
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'list',
          data: {
            openid,
            tab: this.data.currentTab,
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      })

      if (res.result.code === 0) {
        const messageList = res.result.data.list.map(item => ({
          ...item,
          createTime: this.formatTime(item.createTime)
        }))

        const newList = isLoadMore ? [...this.data.messageList, ...messageList] : messageList
        this.setData({
          messageList: newList,
          hasMore: messageList.length === this.data.pageSize
        })
      }
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      hideLoading()
      this.setData({ isLoading: false })
    }
  },

  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) {
      return '刚刚'
    } else if (minutes < 60) {
      return `${minutes}分钟前`
    } else if (hours < 24) {
      return `${hours}小时前`
    } else if (days < 7) {
      return `${days}天前`
    } else {
      return `${date.getMonth() + 1}-${date.getDate()}`
    }
  },

  async markAllAsRead() {
    try {
      const openid = wx.getStorageSync('openid')
      
      if (!openid) return
      
      // 使用云函数批量标记已读
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'markAllRead',
          data: { openid }
        }
      })
      
      if (res.result.code === 0) {
        // 更新未读计数
        this.updateUnreadCount()
      }
    } catch (error) {
      console.error('标记所有消息为已读失败:', error)
    }
  },

  async readMessage(e) {
    const id = e.currentTarget.dataset.id
    const relatedId = e.currentTarget.dataset.relatedId
    const relatedType = e.currentTarget.dataset.relatedType
    const type = e.currentTarget.dataset.type
    const message = this.data.messageList.find(item => item._id === id)
    
    // 标记消息为已读
    if (message && !message.isRead) {
      try {
        const openid = wx.getStorageSync('openid')
        await wx.cloud.callFunction({
          name: 'messages',
          data: {
            action: 'markRead',
            data: { openid, messageId: id }
          }
        })

        const messageList = this.data.messageList.map(item => {
          if (item._id === id) {
            item.isRead = true
          }
          return item
        })

        this.setData({ messageList })
        this.updateUnreadCount()
      } catch (error) {
        console.error('标记已读失败:', error)
      }
    }
    
    // 根据消息类型跳转到对应页面
    if (relatedId && relatedType) {
      this.navigateToRelatedPage(relatedId, relatedType)
    }
  },
  
  navigateToRelatedPage(relatedId, relatedType) {
    // 根据消息类型跳转到对应页面
    if (relatedType.includes('market')) {
      wx.navigateTo({
        url: `/pages/market/detail?id=${relatedId}`
      })
    } else if (relatedType.includes('help-express')) {
      wx.navigateTo({
        url: `/pages/help/detail?id=${relatedId}&type=express`
      })
    } else if (relatedType.includes('help-carpool')) {
      wx.navigateTo({
        url: `/pages/help/detail?id=${relatedId}&type=carpool`
      })
    } else if (relatedType.includes('help-partner')) {
      wx.navigateTo({
        url: `/pages/help/detail?id=${relatedId}&type=partner`
      })
    } else if (relatedType.includes('help-other')) {
      wx.navigateTo({
        url: `/pages/help/detail?id=${relatedId}&type=other`
      })
    } else if (relatedType.includes('lostfound')) {
      wx.navigateTo({
        url: `/pages/lostfound/detail?id=${relatedId}`
      })
    } else if (relatedType.includes('chat')) {
      // 聊天消息，跳转到聊天页面
      wx.navigateTo({
        url: `/pages/chat/chat?otherStuId=${relatedId}&relatedType=${relatedType}`
      })
    }
  },

  async updateUnreadCount() {
    try {
      const openid = wx.getStorageSync('openid')
      
      if (!openid) return
      
      // 使用云函数获取未读计数
      const res = await wx.cloud.callFunction({
        name: 'messages',
        data: {
          action: 'getUnreadCount',
          data: { openid }
        }
      })
      
      if (res.result.code === 0) {
        const count = res.result.data.count
        // 根据未读消息数量显示或隐藏数字角标
        refreshUnreadBadge(count)
      }
    } catch (error) {
      console.error('更新未读计数失败:', error)
    }
  }
})
