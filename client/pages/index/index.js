const { showLoading, hideLoading, navigateTo, switchTab } = require('../../utils/util.js')

Page({
  data: {
    lostfoundList: [],
    marketList: [],
    helpList: [],
    conditionMap: {
      'new': '全新',
      'likeNew': '99新',
      'good': '良好',
      'fair': '一般'
    },
    helpTypeMap: {
      'carpool': '拼车',
      'express': '代取',
      'partner': '搭子',
      'other': '其他'
    },
    helpIconMap: {
      'carpool': '🚗',
      'express': '📦',
      'partner': '👥',
      'other': '📝'
    }
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
    this.checkUnreadMessages()
  },
  
  async checkUnreadMessages() {
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

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    showLoading()
    try {
      await Promise.all([
        this.loadLostfound(),
        this.loadMarket(),
        this.loadHelp()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      hideLoading()
    }
  },

  async loadLostfound() {
    const { result } = await wx.cloud.callFunction({
      name: 'lostfound',
      data: {
        action: 'list',
        data: { page: 1, pageSize: 5 }
      }
    })
    
    if (result.code === 0) {
      this.setData({ lostfoundList: result.data })
    }
  },

  async loadMarket() {
    const { result } = await wx.cloud.callFunction({
      name: 'market',
      data: {
        action: 'list',
        data: { page: 1, pageSize: 4 }
      }
    })
    
    if (result.code === 0) {
      this.setData({ marketList: result.data })
    }
  },

  async loadHelp() {
    const types = ['carpool', 'express', 'partner', 'other']
    const helpList = []
    
    for (const type of types) {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'list',
          data: { type, page: 1, pageSize: 2 }
        }
      })
      
      if (result.code === 0) {
        result.data.forEach(item => {
          item.type = type
          if (item.time) {
            const timeParts = item.time.split(' ')
            if (timeParts.length >= 2) {
              item.date = timeParts[0]
              item.timeSlot = timeParts.slice(1).join(' ')
            } else {
              item.date = ''
              item.timeSlot = item.time
            }
          }
          helpList.push(item)
        })
      }
    }
    
    helpList.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
    this.setData({ helpList: helpList.slice(0, 5) })
  },

  navigateTo(e) { 
    const page = e.currentTarget.dataset.page 
    const pages = { 
      'lostfound': '/pages/lostfound/lostfound', 
      'market': '/pages/market/market', 
      'help': '/pages/help/help', 
      'tools': '/pages/tools/tools' 
    } 
    
    if (pages[page]) { 
        // 校园工具是 tabBar 页面，使用 switchTab
        if (page === 'tools') {
          switchTab(pages[page])
        } else {
          // 其他不是 tabBar 页面，使用 navigateTo
          navigateTo(pages[page])
        }
      } 
  },

  goToDetail(e) {
    const { type, id } = e.currentTarget.dataset
    const pages = {
      'lostfound': `/pages/lostfound/detail?id=${id}`,
      'market': `/pages/market/detail?id=${id}`,
      'carpool': `/pages/help/detail?type=carpool&id=${id}`,
      'express': `/pages/help/detail?type=express&id=${id}`,
      'partner': `/pages/help/detail?type=partner&id=${id}`,
      'other': `/pages/help/detail?type=other&id=${id}`,
      'tools': '/pages/tools/tools' 
    }
    
    if (pages[type]) {
      navigateTo(pages[type])
    }
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    if (keyword) {
      // 跳转到二手市场页并自动搜索
      navigateTo(`/pages/market/market?keyword=${encodeURIComponent(keyword)}`)
    }
  }
})
