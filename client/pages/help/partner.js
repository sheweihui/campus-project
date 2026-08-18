const { showLoading, hideLoading, navigateTo, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoading: false,
    partnerTypeMap: {
      'study': '自习',
      'sport': '运动',
      'eat': '吃饭',
      'game': '游戏',
      'travel': '旅游',
      'others': '其他'
    }
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
            type: 'partner',
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
    navigateTo(`/pages/help/detail?type=partner&id=${id}`)
  },

  goToPublish() {
    if (!requireLogin()) return
    navigateTo('/pages/help/publish?type=partner')
  }
})
