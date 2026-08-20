const { showLoading, hideLoading, navigateTo, requireLogin, getCache, setCache, callCloudFunction } = require('../../utils/util.js')

const LOSTFOUND_CACHE_TTL = 5 * 60 * 1000
const LOSTFOUND_REQUEST_TIMEOUT = 8000

Page({
  data: {
    currentTab: 'all',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false
  },

  onLoad() {
    this._skipNextShowLoad = true
    this.loadData()
  },

  onShow() {
    if (this._skipNextShowLoad) {
      this._skipNextShowLoad = false
      return
    }
    this.loadData()
  },

  // 手动刷新
  onRefresh() {
    this.setData({ page: 1, hasMore: true, list: [] })
    this.loadData()
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
      list: []
    })
    this.loadData()
  },

  getListCacheKey() {
    if (this.data.page !== 1) return ''
    return `cache:lostfound:list:${this.data.currentTab}`
  },

  restoreListCache() {
    const key = this.getListCacheKey()
    if (!key) return false
    const cache = getCache(key, LOSTFOUND_CACHE_TTL)
    if (!cache) return false
    this.setData({
      list: cache.list || [],
      hasMore: cache.hasMore !== false
    })
    return true
  },

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    const cacheKey = this.getListCacheKey()
    const hasCache = !isLoadMore && this.restoreListCache()

    this.setData({ isLoading: true })
    if (!hasCache) showLoading()

    try {
      const type = this.data.currentTab === 'all' ? '' : this.data.currentTab
      const { result } = await callCloudFunction({
        name: 'lostfound',
        data: {
          action: 'list',
          data: {
            type,
            page: this.data.page,
            pageSize: this.data.pageSize,
            scene: 'list'
          }
        }
      }, LOSTFOUND_REQUEST_TIMEOUT)

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

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    navigateTo(`/pages/lostfound/detail?id=${id}`)
  },

  goToPublish() {
    if (!requireLogin()) return
    navigateTo('/pages/lostfound/publish')
  }
})
