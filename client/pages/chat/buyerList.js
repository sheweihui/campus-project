const { showLoading, hideLoading, showToast, navigateTo } = require('../../utils/util.js')

Page({
  data: {
    buyerList: [],
    relatedId: '',
    relatedType: '',
    myStuId: '',
    pageTitle: '联系过该商品的买家',
    pageSubtitle: '买家',
    emptyText: '暂无买家联系',
    emptyDesc: '买家联系后会显示在这里'
  },

  onLoad(options) {
    const { relatedId, relatedType, sellerStuId } = options
    const myStuId = wx.getStorageSync('stuId')
    
    this.setData({
      relatedId,
      relatedType,
      myStuId
    })

    this.setPageTitle(relatedType)
    this.loadBuyerList()
  },

  setPageTitle(relatedType) {
    if (relatedType?.includes('market')) {
      this.setData({
        pageTitle: '联系过该商品的买家',
        pageSubtitle: '买家',
        emptyText: '暂无买家联系',
        emptyDesc: '买家联系后会显示在这里'
      })
    } else if (relatedType?.includes('carpool')) {
      this.setData({
        pageTitle: '联系过该拼车的人',
        pageSubtitle: '联系人',
        emptyText: '暂无联系人',
        emptyDesc: '有人联系后会显示在这里'
      })
    } else if (relatedType?.includes('partner')) {
      this.setData({
        pageTitle: '联系过该搭子的人',
        pageSubtitle: '联系人',
        emptyText: '暂无联系人',
        emptyDesc: '有人联系后会显示在这里'
      })
    } else if (relatedType?.includes('lostfound')) {
      this.setData({
        pageTitle: '联系过该失物的人',
        pageSubtitle: '联系人',
        emptyText: '暂无联系人',
        emptyDesc: '有人联系后会显示在这里'
      })
    }
  },

  async loadBuyerList() {
    showLoading('加载中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'chat',
        data: {
          action: 'getBuyerList',
          data: {
            relatedId: this.data.relatedId,
            sellerStuId: this.data.myStuId
          }
        }
      })

      if (res.result.code === 0) {
        this.setData({ buyerList: res.result.data })
      }
    } catch (error) {
      console.error('加载列表失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  startChat(e) {
    const stuId = e.currentTarget.dataset.stuid
    if (!stuId) return

    navigateTo(`/pages/chat/chat?otherStuId=${stuId}&relatedId=${this.data.relatedId}&relatedType=${this.data.relatedType}`)
  }
})