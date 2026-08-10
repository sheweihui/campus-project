const { showLoading, hideLoading, showToast, navigateTo, navigateBack } = require('../../utils/util.js')

Page({
  data: {
    activeTab: 'all',
    allPosts: [],
    lostfoundPosts: [],
    marketPosts: [],
    helpPosts: [],
    typeMap: {
      'lostfound': '失物招领',
      'market': '二手商品',
      'carpool': '拼车',
      'express': '代取快递',
      'partner': '找搭子',
      'other': '其他互助'
    },
    statusMap: {
      'lostfound': {
        'active': '进行中',
        'completed': '已完成'
      },
      'market': {
        'onSale': '在售',
        'sold': '已售出',
        'off': '已下架'
      },
      'help': {
        'active': '待接单',
        'completed': '已完成',
        'pending': '待接单',
        'accepted': '已接单',
        'paying': '支付中',
        'paid': '已支付'
      }
    }
  },

  onLoad(options) {
    if (options && options.tab) {
      this.setData({ activeTab: options.tab })
    }
    this.loadAllPosts()
  },

  onShow() {
    this.loadAllPosts()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  async loadAllPosts() {
    showLoading()
    try {
      await Promise.all([
        this.loadLostfoundPosts(),
        this.loadMarketPosts(),
        this.loadHelpPosts()
      ])
      this.combineAllPosts()
    } catch (error) {
      console.error('加载发布信息失败:', error)
    } finally {
      hideLoading()
    }
  },

  async loadLostfoundPosts() {
    try {
      const stuId = wx.getStorageSync('stuId')
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'myList',
          data: { stuId, page: 1, pageSize: 50 }
        }
      })

      if (result.code === 0) {
        const posts = result.data.map(item => ({
          ...item,
          type: 'lostfound',
          createTime: this.formatTime(item.createTime)
        }))
        this.setData({ lostfoundPosts: posts })
      }
    } catch (error) {
      console.error('加载失物招领失败:', error)
    }
  },

  async loadMarketPosts() {
    try {
      const stuId = wx.getStorageSync('stuId')
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: 'myList',
          data: { stuId, page: 1, pageSize: 50 }
        }
      })

      if (result.code === 0) {
        const posts = result.data.map(item => ({
          ...item,
          type: 'market',
          createTime: this.formatTime(item.createTime)
        }))
        this.setData({ marketPosts: posts })
      }
    } catch (error) {
      console.error('加载二手商品失败:', error)
    }
  },

  async loadHelpPosts() {
    try {
      const stuId = wx.getStorageSync('stuId')
      const types = ['carpool', 'express', 'partner', 'other']
      const helpPosts = []

      for (const type of types) {
        const { result } = await wx.cloud.callFunction({
          name: 'help',
          data: {
            action: 'myList',
            data: { type, stuId, page: 1, pageSize: 50 }
          }
        })

        if (result.code === 0) {
          const posts = result.data.map(item => ({
            ...item,
            type: 'help',
            helpType: type,
            createTime: this.formatTime(item.createTime)
          }))
          helpPosts.push(...posts)
        }
      }

      this.setData({ helpPosts })
    } catch (error) {
      console.error('加载互助信息失败:', error)
    }
  },

  combineAllPosts() {
    const { lostfoundPosts, marketPosts, helpPosts } = this.data
    const allPosts = [
      ...lostfoundPosts,
      ...marketPosts,
      ...helpPosts
    ].sort((a, b) => new Date(b.createTime) - new Date(a.createTime))

    this.setData({ allPosts })
  },

  formatTime(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  goToDetail(e) {
    const { type, id, helpType } = e.currentTarget.dataset
    
    if (type === 'lostfound') {
      navigateTo(`/pages/lostfound/detail?id=${id}`)
    } else if (type === 'market') {
      navigateTo(`/pages/market/detail?id=${id}`)
    } else if (type === 'help') {
      navigateTo(`/pages/help/detail?type=${helpType}&id=${id}`)
    }
  },

  editPost(e) {
    // 阻止事件冒泡
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
    
    console.log('编辑按钮点击:', e.currentTarget.dataset)
    
    const { type, id } = e.currentTarget.dataset
    
    if (!type || !id) {
      showToast('参数错误')
      return
    }
    
    let url = ''
    if (type === 'lostfound') {
      url = `/pages/lostfound/publish?id=${id}`
    } else if (type === 'market') {
      url = `/pages/market/publish?id=${id}`
    } else if (['carpool', 'express', 'partner'].includes(type)) {
      url = `/pages/help/publish?type=${type}&id=${id}`
    }
    
    if (url) {
      console.log('跳转到编辑页面:', url)
      wx.navigateTo({
        url,
        success: () => {
          console.log('跳转成功')
        },
        fail: (error) => {
          console.error('跳转失败:', error)
          showToast('跳转失败')
        }
      })
    } else {
      showToast('未知类型')
    }
  },

  async deletePost(e) {
    // 阻止事件冒泡
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
    
    console.log('删除按钮点击:', e.currentTarget.dataset)
    
    const { type, id } = e.currentTarget.dataset
    
    if (!type || !id) {
      showToast('参数错误')
      return
    }
    
    const { confirm } = await wx.showModal({
      title: '确认删除',
      content: '确定要删除这条发布信息吗？',
      confirmColor: '#f44336'
    })

    if (!confirm) return

    showLoading('删除中...')
    try {
      let result
      
      console.log('开始删除，类型:', type, 'ID:', id)
      
      if (type === 'lostfound') {
        result = await wx.cloud.callFunction({
          name: 'lostfound',
          data: {
            action: 'delete',
            data: { id }
          },
          timeout: 10000 // 设置超时时间
        })
      } else if (type === 'market') {
        result = await wx.cloud.callFunction({
          name: 'market',
          data: {
            action: 'delete',
            data: { id }
          },
          timeout: 10000 // 设置超时时间
        })
      } else if (['carpool', 'express', 'partner'].includes(type)) {
        result = await wx.cloud.callFunction({
          name: 'help',
          data: {
            action: 'delete',
            data: { type, id }
          },
          timeout: 10000 // 设置超时时间
        })
      }
      
      console.log('删除结果:', result)

      if (result && result.code === 0) {
        showToast('删除成功')
        this.loadAllPosts()
      } else {
        showToast(result && result.msg || '删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      showToast('删除失败')
    } finally {
      hideLoading()
      console.log('删除操作完成')
    }
  }
})
