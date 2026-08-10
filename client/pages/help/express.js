const { showLoading, hideLoading, navigateTo, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false,
    expressStatusMap: {
      'pending': '待接单',
      'accepted': '已接单',
      'completed': '已完成'
    }
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

  async loadData(isLoadMore = false) {
    if (this.data.isLoading) return
    
    this.setData({ isLoading: true })
    showLoading()

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'list',
          data: {
            type: 'express',
            page: this.data.page,
            pageSize: this.data.pageSize
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

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    navigateTo(`/pages/help/detail?type=express&id=${id}`)
  },

  goToPublish() {
    if (!requireLogin()) return
    navigateTo('/pages/help/publish?type=express')
  }
})
