const { showLoading, hideLoading, navigateTo, switchTab, refreshUnreadBadge, getCache, isCacheFresh, setCache, callCloudFunction } = require('../../utils/util.js')

const HOME_CACHE_KEY = 'cache:home:index'
const HOME_CACHE_TTL = 10 * 60 * 1000
const HOME_REQUEST_TIMEOUT = 5000

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
    const hasCache = this.restoreHomeCache()
    if (!hasCache) {
      this.loadData()
    }
  },

  onShow() {
    this.computeSky()
    if (this._skipNextShowLoad) {
      this._skipNextShowLoad = false
    } else if (!isCacheFresh(HOME_CACHE_KEY, HOME_CACHE_TTL)) {
      this.loadData({ silent: true })
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
    this.loadData({ force: true }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  restoreHomeCache() {
    const cache = getCache(HOME_CACHE_KEY, HOME_CACHE_TTL)
    if (!cache) return false
    this.setData({
      lostfoundList: cache.lostfoundList || [],
      marketList: cache.marketList || [],
      helpList: cache.helpList || []
    })
    return true
  },

  async loadData(options = {}) {
    if (this._loadingData) return
    const silent = !!options.silent
    const force = !!options.force
    if (!force && isCacheFresh(HOME_CACHE_KEY, HOME_CACHE_TTL)) return
    this._loadingData = true
    if (!silent) showLoading()
    try {
      const [lostfoundList, marketList, helpList] = await Promise.all([
        this.loadLostfound().catch(error => {
          console.error('首页失物招领加载失败:', error)
          return this.data.lostfoundList
        }),
        this.loadMarket().catch(error => {
          console.error('首页二手市场加载失败:', error)
          return this.data.marketList
        }),
        this.loadHelp().catch(error => {
          console.error('首页互助加载失败:', error)
          return this.data.helpList
        })
      ])
      const nextData = { lostfoundList, marketList, helpList }
      this.setData(nextData)
      setCache(HOME_CACHE_KEY, nextData)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      if (!silent) hideLoading()
      this._loadingData = false
    }
  },

  async loadLostfound() {
    let { result } = await callCloudFunction({
      name: 'lostfound',
      data: {
        action: 'homeList',
        data: { pageSize: 5 }
      }
    }, HOME_REQUEST_TIMEOUT)

    if (!result || result.code !== 0) {
      const fallback = await callCloudFunction({
        name: 'lostfound',
        data: {
          action: 'list',
          data: { page: 1, pageSize: 5, scene: 'home' }
        }
      }, HOME_REQUEST_TIMEOUT)
      result = fallback.result
    }
    
    if (result && result.code === 0) {
      return result.data || []
    }
    return this.data.lostfoundList
  },

  async loadMarket() {
    let { result } = await callCloudFunction({
      name: 'market',
      data: {
        action: 'homeList',
        data: { pageSize: 4 }
      }
    }, HOME_REQUEST_TIMEOUT)

    if (!result || result.code !== 0) {
      const fallback = await callCloudFunction({
        name: 'market',
        data: {
          action: 'list',
          data: { page: 1, pageSize: 4, scene: 'home' }
        }
      }, HOME_REQUEST_TIMEOUT)
      result = fallback.result
    }
    
    if (result && result.code === 0) {
      return result.data || []
    }
    return this.data.marketList
  },

  async loadHelp() {
    const helpList = await this.loadHelpByType()
    return helpList.map(item => {
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
  },

  async loadHelpByType() {
    const { result } = await callCloudFunction({
      name: 'help',
      data: {
        action: 'homeList',
        data: { pageSize: 5 }
      }
    }, HOME_REQUEST_TIMEOUT)

    return result && result.code === 0 ? (result.data || []) : this.data.helpList
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
