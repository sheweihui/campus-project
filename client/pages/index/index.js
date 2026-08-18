const { showLoading, hideLoading, navigateTo, switchTab, refreshUnreadBadge } = require('../../utils/util.js')

Page({
  data: {
    lostfoundList: [],
    marketList: [],
    helpList: [],
    activeTab: 'market',
    isNight: true,
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
    this._skipNextShowLoad = true
    this.computeSky()
    this.loadData()
  },

  onShow() {
    this.computeSky()
    if (this._skipNextShowLoad) {
      this._skipNextShowLoad = false
    } else {
      this.loadData()
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  // 根据当前时间切换白天/夜晚（6:00-18:00 白天，其余夜晚）
  computeSky() {
    const hour = new Date().getHours()
    this.setData({ isNight: !(hour >= 6 && hour < 18) })
  },

  // 切换首页内容 tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab !== this.data.activeTab) {
      this.setData({ activeTab: tab })
    }
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
        refreshUnreadBadge(count)
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
    if (this._loadingData) return
    this._loadingData = true
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
      this._loadingData = false
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
    const { result } = await wx.cloud.callFunction({
      name: 'help',
      data: {
        action: 'homeList',
        data: { pageSize: 5 }
      }
    })

    if (result.code !== 0) return

    const helpList = result.data.map(item => {
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
      return item
    })
    this.setData({ helpList })
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

})
