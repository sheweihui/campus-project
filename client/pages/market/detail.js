const { showLoading, hideLoading, showToast, navigateTo, navigateBack, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    detail: null,
    isOwner: false,
    isVisitor: false,
    createTime: '',
    categoryMap: {
      'books': '书籍',
      'digital': '数码',
      'daily': '生活用品',
      'others': '其他'
    },
    conditionMap: {
      'new': '全新',
      'likeNew': '99新',
      'good': '良好',
      'fair': '一般'
    },
    statusMap: {
      'onSale': '在售',
      'paying': '交易中',
      'sold': '已售出',
      'off': '已下架'
    }
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
        name: 'market',
        data: {
          action: 'detail',
          data: { id }
        }
      })

      if (result.code === 0) {
        const detail = result.data
        const currentStuId = wx.getStorageSync('stuId') || ''
        
        console.log('当前用户学号:', currentStuId)
        console.log('卖家学号:', detail.stuId)

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
    if (!requireLogin()) return

    const { detail, isOwner } = this.data
    
    if (isOwner) {
      // 卖家：跳转到买家列表
      navigateTo(`/pages/chat/buyerList?relatedId=${detail._id}`)
    } else {
      // 买家：跳转到聊天页面
      const otherStuId = detail.stuId
      
      if (!otherStuId) {
        showToast('卖家信息不存在')
        return
      }

      navigateTo(`/pages/chat/chat?otherStuId=${otherStuId}&relatedId=${detail._id}&relatedType=market`)
    }
  },

  async updateStatus() {
    if (!requireLogin()) return

    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要标记为已售出吗？'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: 'updateStatus',
          data: {
            id: this.data.detail._id,
            status: 'sold'
          }
        }
      })

      if (result.code === 0) {
        showToast('状态更新成功')
        this.setData({
          'detail.status': 'sold'
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

  async updateStatusOff() {
    if (!requireLogin()) return

    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要下架该商品吗？'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: 'updateStatus',
          data: {
            id: this.data.detail._id,
            status: 'off'
          }
        }
      })

      if (result.code === 0) {
        showToast('已下架')
        this.setData({
          'detail.status': 'off'
        })
      } else {
        showToast(result.msg)
      }
    } catch (error) {
      showToast('操作失败')
    } finally {
      hideLoading()
    }
  },

  editItem() {
    if (!requireLogin()) return
    navigateTo(`/pages/market/publish?id=${this.data.detail._id}`)
  },

  async buyNow() {
    if (!requireLogin()) return

    const { detail } = this.data
    
    const { confirm } = await wx.showModal({
      title: '确认支付',
      content: `支付金额：¥${detail.price}\n卖家：${detail.nickName || '卖家'}\n确定要支付吗？`
    })

    if (!confirm) return

    showLoading('支付中...')
    try {
      const description = `二手商品购买 ¥${detail.price}`
      
      console.log('调用支付云函数:', { itemId: detail._id, amount: detail.price, description, itemType: 'market' })
      
      const { result } = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          action: 'unifiedOrder',
          data: {
            itemId: detail._id,
            amount: detail.price,
            description,
            itemType: 'market'
          }
        }
      })

      console.log('支付云函数返回:', JSON.stringify(result, null, 2))

      if (result.code !== 0) {
        showToast(result.msg || '支付失败')
        return
      }

      const paymentParams = result.data.payment
      const outTradeNo = result.data.outTradeNo
      
      console.log('支付参数:', JSON.stringify(paymentParams, null, 2))
      
      wx.hideLoading()
      
      const payResult = await wx.requestPayment(paymentParams)
      
      showToast('支付成功', 'success')
      this.setData({
        'detail.status': 'sold'
      })
    } catch (error) {
      console.error('支付失败:', error)
      console.error('支付失败详情:', JSON.stringify(error, null, 2))
      if (error.errMsg && error.errMsg.includes('requestPayment:fail')) {
        showToast('支付已取消')
        // 取消支付：通知服务端关闭订单并释放商品占用
        if (outTradeNo) {
          wx.cloud.callFunction({
            name: 'pay',
            data: { action: 'close', data: { outTradeNo } }
          }).catch(e => console.error('关闭支付订单失败:', e))
        }
      } else {
        showToast('支付失败')
        if (outTradeNo) {
          wx.cloud.callFunction({
            name: 'pay',
            data: { action: 'close', data: { outTradeNo } }
          }).catch(e => console.error('关闭支付订单失败:', e))
        }
      }
    } finally {
      hideLoading()
    }
  },

  async deleteItem() {
    if (!requireLogin()) return

    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要删除该商品吗？',
      confirmColor: '#f44336'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'market',
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
  }
})
