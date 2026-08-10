const { showLoading, hideLoading, navigateTo, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    carpoolList: [],
    expressList: [],
    partnerList: [],
    otherList: [],
    partnerTypeMap: {
      'study': '自习',
      'sport': '运动',
      'eat': '吃饭',
      'game': '游戏',
      'travel': '旅游',
      'others': '其他'
    },
    expressStatusMap: {
      'pending': '待接单',
      'accepted': '已接单',
      'completed': '已完成',
      'active': '待接单'
    }
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    showLoading()
    try {
      await Promise.all([
        this.loadCarpool(),
        this.loadExpress(),
        this.loadPartner(),
        this.loadOther()
      ])
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      hideLoading()
    }
  },

  async loadCarpool() {
    const { result } = await wx.cloud.callFunction({
      name: 'help',
      data: {
        action: 'list',
        data: { type: 'carpool', page: 1, pageSize: 3 }
      }
    })
    
    if (result.code === 0) {
      const list = result.data.map(item => this.formatTimeItem(item))
      this.setData({ carpoolList: list })
    }
  },

  async loadExpress() {
    const { result } = await wx.cloud.callFunction({
      name: 'help',
      data: {
        action: 'list',
        data: { type: 'express', page: 1, pageSize: 3 }
      }
    })
    
    if (result.code === 0) {
      const list = result.data.map(item => this.formatTimeItem(item))
      this.setData({ expressList: list })
    }
  },

  async loadPartner() {
    const { result } = await wx.cloud.callFunction({
      name: 'help',
      data: {
        action: 'list',
        data: { type: 'partner', page: 1, pageSize: 3 }
      }
    })
    
    if (result.code === 0) {
      const list = result.data.map(item => this.formatTimeItem(item))
      this.setData({ partnerList: list })
    }
  },

  async loadOther() {
    const { result } = await wx.cloud.callFunction({
      name: 'help',
      data: {
        action: 'list',
        data: { type: 'other', page: 1, pageSize: 3 }
      }
    })
    
    if (result.code === 0) {
      const list = result.data.map(item => this.formatTimeItem(item))
      this.setData({ otherList: list })
    }
  },

  formatTimeItem(item) {
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
  },

  goToPage(e) {
    const page = e.currentTarget.dataset.page
    if (page === 'publish' && !requireLogin()) return
    navigateTo(`/pages/help/${page}`)
  },

  goToDetail(e) {
    const { type, id } = e.currentTarget.dataset
    navigateTo(`/pages/help/detail?type=${type}&id=${id}`)
  }
})
