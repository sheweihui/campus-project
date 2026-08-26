const { showToast } = require('../../../utils/util.js')

Page({
  data: {
    typeFilter: 'all',
    statusFilter: 'all',
    orderStatusFilter: 'all',
    keyword: '',
    dateStart: '',
    dateEnd: '',

    typeTabs: [
      { key: 'all', label: '全部' },
      { key: 'market', label: '二手市场' },
      { key: 'lostfound', label: '失物招领' },
      { key: 'help', label: '校园互助' }
    ],

    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待支付' },
      { key: 'paid', label: '已支付' },
      { key: 'confirmed', label: '已确认' }
    ],

    orderStatusTabs: [
      { key: 'all', label: '全部状态' },
      { key: 'pending', label: '进行中' },
      { key: 'completed', label: '已完成' },
      { key: 'cancelled', label: '已取消' }
    ],

    orders: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,
    showFilterPanel: false
  },

  onLoad() {
    const filter = wx.getStorageSync('orderFilter')
    if (filter) {
      this.setData({ typeFilter: filter })
      wx.removeStorageSync('orderFilter')
    }
    this.loadOrders()
  },

  onShow() {
    if (this._loadedOnce) {
      this.loadOrders()
    }
    this._loadedOnce = true
  },

  onPullDownRefresh() {
    this.setData({ page: 1, orders: [], hasMore: true })
    Promise.resolve(this.loadOrders()).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(true)
    }
  },

  buildParams(page) {
    const params = {
      page,
      pageSize: this.data.pageSize
    }
    if (this.data.typeFilter !== 'all') params.type = this.data.typeFilter
    if (this.data.statusFilter !== 'all') params.paymentStatus = this.data.statusFilter
    if (this.data.orderStatusFilter !== 'all') params.orderStatus = this.data.orderStatusFilter
    if (this.data.keyword.trim()) params.keyword = this.data.keyword.trim()
    if (this.data.dateStart) params.startDate = this.data.dateStart
    if (this.data.dateEnd) params.endDate = this.data.dateEnd
    return params
  },

  async loadOrders(loadMore = false) {
    if (this.data.loading) return

    const page = loadMore ? this.data.page + 1 : 1
    this.setData({ loading: true })

    try {
      const params = this.buildParams(page)
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getOrders',
          data: params
        }
      })

      if (!result || result.code !== 0) {
        showToast((result && result.msg) || '加载失败')
        this.setData({ loading: false })
        return
      }

      const list = result.data && Array.isArray(result.data.list) ? result.data.list : []
      const total = result.data ? Number(result.data.total) || 0 : 0
      const totalPages = result.data ? Number(result.data.totalPages) || 0 : 0
      const newOrders = loadMore ? [...this.data.orders, ...list] : list

      this.setData({
        orders: newOrders,
        page,
        total,
        hasMore: page < totalPages,
        loading: false
      })
    } catch (error) {
      console.error('加载订单失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  onTypeChange(e) {
    const type = e.currentTarget.dataset.key
    this.setData({ typeFilter: type, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  onOrderStatusChange(e) {
    const status = e.currentTarget.dataset.key
    this.setData({ orderStatusFilter: status, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  onStatusChange(e) {
    const status = e.currentTarget.dataset.key
    this.setData({ statusFilter: status, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  toggleFilter() {
    this.setData({ showFilterPanel: !this.data.showFilterPanel })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  onDateStartChange(e) {
    this.setData({ dateStart: e.detail.value })
  },

  onDateEndChange(e) {
    this.setData({ dateEnd: e.detail.value })
  },

  applyDateFilter() {
    this.setData({ showFilterPanel: false, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  clearFilters() {
    this.setData({
      typeFilter: 'all',
      statusFilter: 'all',
      orderStatusFilter: 'all',
      keyword: '',
      dateStart: '',
      dateEnd: '',
      showFilterPanel: false,
      page: 1,
      orders: [],
      hasMore: true
    })
    this.loadOrders()
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id && !String(id).startsWith('pay_')) {
      wx.navigateTo({ url: '/pages/merchant/order-detail/order-detail?id=' + id })
    }
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/merchant/orders/order-edit' })
  }
})
