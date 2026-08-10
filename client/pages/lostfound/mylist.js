const { showLoading, hideLoading, navigateTo } = require('../../utils/util.js')

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
    this.loadData()
  },

  onShow() {
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

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    
    this.setData({ isLoading: true })
    showLoading()

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'myList',
          data: {
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      })

      if (result.code === 0) {
        let list = result.data
        
        // 根据标签筛选
        if (this.data.currentTab !== 'all') {
          list = list.filter(item => item.type === this.data.currentTab)
        }
        
        const newList = isLoadMore ? [...this.data.list, ...list] : list
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

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    navigateTo(`/pages/lostfound/detail?id=${id}`)
  },

  goToPublish() {
    navigateTo('/pages/lostfound/publish')
  }
})