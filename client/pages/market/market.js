const { showLoading, hideLoading, navigateTo, requireLogin, getCache, setCache, callCloudFunction } = require('../../utils/util.js')

const MARKET_CACHE_VERSION = 'v3'
const MARKET_CACHE_TTL = 60 * 1000
const MARKET_REQUEST_TIMEOUT = 8000

Page({
  data: {
    currentCategory: 'all',
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false,
    categoryMap: {
      'books': '书籍',
      'digital': '数码',
      'daily': '生活用品',
      'others': '其他'
    },
    conditionMap: {
      'new': '全新',
      'likeNew': '99新',
      'good': '良好',
      'fair': '一般'
    }
  },

  onLoad(options) {
    this.enableShareMenu()
    this._skipNextShowLoad = true
    // 支持从首页搜索框带入 keyword 自动搜索
    if (options && options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) })
      this.searchData()
      return
    }
    if (options && options.category) {
      this.setData({ currentCategory: decodeURIComponent(options.category) })
    }
    this.loadData()
  },

  enableShareMenu() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  onShow() {
    if (this._skipNextShowLoad) {
      this._skipNextShowLoad = false
      return
    }
    // 若处于搜索态则刷新搜索结果，否则刷新列表
    if (this.data.keyword) {
      this.searchData()
    } else {
      this.loadData()
    }
  },

  // 手动刷新
  onRefresh() {
    this.setData({ page: 1, hasMore: true, list: [] })
    if (this.data.keyword) {
      this.searchData()
    } else {
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    const task = this.data.keyword ? this.searchData() : this.loadData()
    Promise.resolve(task).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 })
      if (this.data.keyword) {
        this.searchData(true)
      } else {
        this.loadData(true)
      }
    }
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      currentCategory: category,
      keyword: '',
      page: 1,
      hasMore: true,
      list: []
    })
    this.loadData()
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({
      page: 1,
      hasMore: true,
      list: []
    })
    this.searchData()
  },

  getListCacheKey(type) {
    const page = this.data.page
    if (page !== 1) return ''
    if (type === 'search') {
      return `cache:market:${MARKET_CACHE_VERSION}:search:${this.data.keyword.trim()}`
    }
    return `cache:market:${MARKET_CACHE_VERSION}:list:${this.data.currentCategory}`
  },

  restoreListCache(type) {
    const key = this.getListCacheKey(type)
    if (!key) return false
    const cache = getCache(key, MARKET_CACHE_TTL)
    if (!cache) return false
    this.setData({
      list: cache.list || [],
      hasMore: cache.hasMore !== false
    })
    return true
  },

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    const cacheKey = this.getListCacheKey('list')
    const hasCache = !isLoadMore && this.restoreListCache('list')

    this.setData({ isLoading: true })
    if (!hasCache) showLoading()

    try {
      const category = this.data.currentCategory === 'all' ? '' : this.data.currentCategory
      const { result } = await callCloudFunction({
        name: 'market',
        data: {
          action: 'list',
          data: {
            category,
            page: this.data.page,
            pageSize: this.data.pageSize,
            scene: 'list'
          }
        }
      }, MARKET_REQUEST_TIMEOUT)

      if (result.code === 0) {
        const newList = isLoadMore ? [...this.data.list, ...result.data] : result.data
        this.setData({
          list: newList,
          hasMore: result.data.length === this.data.pageSize
        })
        if (cacheKey && !isLoadMore) {
          setCache(cacheKey, {
            list: newList,
            hasMore: result.data.length === this.data.pageSize
          })
        }
      }
    } catch (error) {
      console.error('加载失败:', error)
    } finally {
      if (!hasCache) hideLoading()
      this.setData({ isLoading: false })
    }
  },

  async searchData(isLoadMore = false) {
    if (!this.data.keyword.trim()) {
      this.loadData()
      return
    }

    if (this.data.isLoading) return

    const cacheKey = this.getListCacheKey('search')
    const hasCache = !isLoadMore && this.restoreListCache('search')

    this.setData({ isLoading: true })
    if (!hasCache) showLoading()
    try {
      const { result } = await callCloudFunction({
        name: 'market',
        data: {
          action: 'search',
          data: {
            keyword: this.data.keyword,
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      }, MARKET_REQUEST_TIMEOUT)

      if (result.code === 0) {
        const newList = isLoadMore ? [...this.data.list, ...result.data] : result.data
        this.setData({
          list: newList,
          hasMore: result.data.length === this.data.pageSize
        })
        if (cacheKey && !isLoadMore) {
          setCache(cacheKey, {
            list: newList,
            hasMore: result.data.length === this.data.pageSize
          })
        }
      }
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      if (!hasCache) hideLoading()
      this.setData({ isLoading: false })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    navigateTo(`/pages/market/detail?id=${id}`)
  },

  goToPublish() {
    if (!requireLogin()) return
    navigateTo('/pages/market/publish')
  },

  onShareAppMessage() {
    const category = this.data.currentCategory
    const path = category && category !== 'all' ? `/pages/market/market?category=${category}` : '/pages/market/market'
    return {
      title: '校园二手集市',
      path
    }
  },

  onShareTimeline() {
    const category = this.data.currentCategory
    return {
      title: '校园二手集市',
      query: category && category !== 'all' ? `category=${category}` : ''
    }
  }
})
