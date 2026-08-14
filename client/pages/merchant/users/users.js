const { formatAmount, formatTime, showToast, showLoading, hideLoading } = require('../../../utils/util.js')

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
  // 给用户发送站内消息（管理员）
  sendMessageToUser(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.openid) {
      showToast('用户信息不完整')
      return
    }

    wx.showModal({
      title: `给 ${item.nickName || '该用户'} 发消息`,
      editable: true,
      placeholderText: '请输入消息内容',
      confirmText: '发送',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        const content = (res.content || '').trim()
        if (!content) {
          showToast('消息内容不能为空')
          return
        }

        showLoading('发送中...')
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'admin',
            data: {
              action: 'sendUserMessage',
              data: {
                targetOpenid: item.openid,
                title: '平台通知',
                content
              }
            }
          })
          if (result.code === 0) {
            showToast('发送成功', 'success')
          } else {
            showToast(result.msg || '发送失败')
          }
        } catch (error) {
          console.error('发送消息失败:', error)
          showToast('发送失败')
        } finally {
          hideLoading()
        }
      }
    })
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, users: [], hasMore: true })
    this.loadUsers()
  }
})
