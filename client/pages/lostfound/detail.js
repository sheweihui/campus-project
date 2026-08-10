const { showLoading, hideLoading, showToast, navigateTo, navigateBack } = require('../../utils/util.js')

Page({
  data: {
    detail: null,
    isOwner: false,
    createTime: ''
  },

  onLoad(options) {
    if (options.id) {
      this.loadDetail(options.id)
    }
  },

  async loadDetail(id) {
    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'detail',
          data: { id }
        }
      })

      if (result.code === 0) {
        const detail = result.data
        const currentStuId = wx.getStorageSync('stuId') || ''
        
        const isOwner = detail.stuId === currentStuId
        const isVisitor = !isOwner

        this.setData({
          detail,
          isOwner,
          isVisitor,
          createTime: this.formatTime(detail.createTime)
        })
      }
    } catch (error) {
      console.error('加载详情失败:', error)
    } finally {
      hideLoading()
    }
  },

  formatTime(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      urls: this.data.detail.images,
      current: url
    })
  },

  copyContact() {
    wx.setClipboardData({
      data: this.data.detail.contact,
      success: () => {
        showToast('已复制联系方式')
      }
    })
  },

  startChat() {
    const { detail, isOwner } = this.data
    
    if (isOwner) {
      // 卖家：跳转到买家列表
      navigateTo(`/pages/chat/buyerList?relatedId=${detail._id}`)
    } else {
      // 买家：跳转到聊天页面
      const otherStuId = detail.stuId
      
      if (!otherStuId) {
        showToast('发布者信息不存在')
        return
      }

      navigateTo(`/pages/chat/chat?otherStuId=${otherStuId}&relatedId=${detail._id}&relatedType=lostfound`)
    }
  },

  async updateStatus() {
    if (this.data.detail.status === 'completed') return

    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要标记为已完成吗？'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'updateStatus',
          data: {
            id: this.data.detail._id,
            status: 'completed'
          }
        }
      })

      if (result.code === 0) {
        showToast('状态更新成功')
        this.setData({
          'detail.status': 'completed'
        })
      } else {
        showToast(result.msg)
      }
    } catch (error) {
      showToast('更新失败')
    } finally {
      hideLoading()
    }
  },

  editItem() {
    navigateTo(`/pages/lostfound/publish?id=${this.data.detail._id}&type=${this.data.detail.type}`)
  },

  async deleteItem() {
    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要删除这条信息吗？',
      confirmColor: '#f44336'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'delete',
          data: { id: this.data.detail._id }
        }
      })

      if (result.code === 0) {
        showToast('删除成功')
        setTimeout(() => {
          navigateBack()
        }, 1500)
      } else {
        showToast(result.msg)
      }
    } catch (error) {
      showToast('删除失败')
    } finally {
      hideLoading()
    }
  },

  contactOwner() {
    wx.showModal({
      title: '联系发布者',
      content: '请通过物品描述中的联系方式与发布者取得联系',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})