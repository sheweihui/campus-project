const { showLoading, hideLoading, navigateTo, requireLogin } = require('../../utils/util.js')

Page({
  data: {
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
            type: 'other',
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      })

      if (result.code === 0) {
        const formattedList = result.data.map(item => {
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
        const newList = isLoadMore ? [...this.data.list, ...formattedList] : formattedList
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
    navigateTo(`/pages/help/detail?type=other&id=${id}`)
  },

  goToPublish() {
    if (!requireLogin()) return
    navigateTo('/pages/help/publish?type=other')
  }
})
