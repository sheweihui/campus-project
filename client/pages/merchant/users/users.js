const { formatAmount, formatTime, showToast } = require('../../../utils/util.js')

Page({
  data: {
    keyword: '',
    users: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadUsers()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, users: [], hasMore: true })
    this.loadUsers().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadUsers(true)
    }
  },

  async loadUsers(loadMore = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const page = loadMore ? this.data.page + 1 : 1

    try {
      const params = { page, pageSize: this.data.pageSize }
      if (this.data.keyword) params.keyword = this.data.keyword

      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getUserList',
          data: params
        }
      })

      if (result.code === 0) {
        const list = loadMore ? [...this.data.users, ...result.data.list] : result.data.list
        this.setData({
          users: list,
          page,
          total: result.data.total,
          hasMore: page < result.data.totalPages,
          loading: false
        })
      } else {
        showToast(result.msg || '加载失败')
        this.setData({ loading: false })
      }
    } catch (error) {
      console.error('加载用户列表失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 搜索
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, users: [], hasMore: true })
    this.loadUsers()
  }
})
