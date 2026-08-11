const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

Page({
  data: {
    // 筛选
    typeFilter: 'all',        // all, market, lostfound, help
    statusFilter: 'all',      // all, pending, paid, confirmed
    orderStatusFilter: 'all', // all, pending, completed, cancelled
    keyword: '',
    dateStart: '',
    dateEnd: '',

    // 类型 tabs
    typeTabs: [
      { key: 'all', label: '全部' },
      { key: 'market', label: '二手市场' },
      { key: 'lostfound', label: '失物招领' },
      { key: 'help', label: '校园互助' }
    ],

    // 状态 tabs
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待支付' },
      { key: 'paid', label: '已支付' },
      { key: 'confirmed', label: '已确认' }
    ],

    // 订单列表
    orders: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,

    // 显示筛选面板
    showFilterPanel: false
  },

  onLoad() {
    // 从 dashboard 传过来的分类筛选
    const filter = wx.getStorageSync('orderFilter')
    if (filter) {
      this.setData({ typeFilter: filter })
      wx.removeStorageSync('orderFilter')
    }
    this.loadOrders()
  },

  onShow() {
    // 每次显示时刷新（可能从详情页返回）
    const pages = getCurrentPages()
    if (pages.length > 1) {
      this.loadOrders()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, orders: [], hasMore: true })
    this.loadOrders().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(true)
    }
  },

  async loadOrders(loadMore = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const page = loadMore ? this.data.page + 1 : 1

    try {
      const params = {
        page,
        pageSize: this.data.pageSize
      }
      if (this.data.typeFilter !== 'all') params.type = this.data.typeFilter
      if (this.data.statusFilter !== 'all') params.paymentStatus = this.data.statusFilter
      if (this.data.orderStatusFilter !== 'all') params.orderStatus = this.data.orderStatusFilter
      if (this.data.keyword) params.keyword = this.data.keyword
      if (this.data.dateStart) params.startDate = this.data.dateStart
      if (this.data.dateEnd) params.endDate = this.data.dateEnd

      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getOrders',
          data: params
        }
      })

      if (result.code === 0) {
        const newOrders = loadMore ? [...this.data.orders, ...result.data.list] : result.data.list
        this.setData({
          orders: newOrders,
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
      console.error('加载订单失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 切换类型筛选
  onTypeChange(e) {
    const type = e.currentTarget.dataset.key
    this.setData({ typeFilter: type, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  // 切换状态筛选
  onStatusChange(e) {
    const status = e.currentTarget.dataset.key
    this.setData({ statusFilter: status, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  // 切换筛选面板
  toggleFilter() {
    this.setData({ showFilterPanel: !this.data.showFilterPanel })
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  // 搜索
  onSearch() {
    this.setData({ page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  // 选择开始日期
  onDateStartChange(e) {
    this.setData({ dateStart: e.detail.value })
  },

  // 选择结束日期
  onDateEndChange(e) {
    this.setData({ dateEnd: e.detail.value })
  },

  // 应用日期筛选
  applyDateFilter() {
    this.setData({ showFilterPanel: false, page: 1, orders: [], hasMore: true })
    this.loadOrders()
  },

  // 清除筛选
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

  // 查看订单详情
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/merchant/order-detail/order-detail?id=' + id })
  },

  // 新增订单（手工录入，如线下交易）
  goToCreate() {
    wx.navigateTo({ url: '/pages/merchant/orders/order-edit' })
  }
})
