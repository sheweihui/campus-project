const { showLoading, hideLoading, navigateTo, requireLogin } = require('../../utils/util.js')

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
    this._skipNextShowLoad = true
    // 支持从首页搜索框带入 keyword 自动搜索
    if (options && options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) })
      this.searchData()
      return
    }
    this.loadData()
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

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    
    this.setData({ isLoading: true })
    showLoading()

    try {
      const category = this.data.currentCategory === 'all' ? '' : this.data.currentCategory
      const { result } = await wx.cloud.callFunction({
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
      })

      if (result.code === 0) {
        const newList = isLoadMore ? [...this.data.list, ...result.data] : result.data
        this.setData({
          list: newList,
          hasMore: result.data.length === this.data.pageSize
        })
      }
    } catch (error) {
      console.error('加载失败:', error)
    } finally {
      hideLoading()
      this.setData({ isLoading: false })
    }
  },

  async searchData(isLoadMore = false) {
    if (!this.data.keyword.trim()) {
      this.loadData()
      return
    }

    if (this.data.isLoading) return

    this.setData({ isLoading: true })
    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: 'search',
          data: {
            keyword: this.data.keyword,
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      })

      if (result.code === 0) {
        this.setData({
          list: isLoadMore ? [...this.data.list, ...result.data] : result.data,
          hasMore: result.data.length === this.data.pageSize
        })
      }
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      hideLoading()
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
  }
})
