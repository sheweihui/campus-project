const { showLoading, hideLoading, showToast, navigateTo, navigateBack, requireLogin } = require('../../utils/util.js')
const TEMPLATES = require('../../config/templateIds.js')

Page({
  data: {
    detail: null,
    isOwner: false,
    isAcceptor: false,
    isVisitor: false,
    createTime: '',
    type: '',
    partnerTypeMap: {
      'study': '自习',
      'sport': '运动',
      'eat': '吃饭',
      'game': '游戏',
      'travel': '旅游',
      'others': '其他'
    },
    expressStatusMap: {
      'pending': '待支付',
      'prepaid': '待接单（已预付）',
      'accepted': '已接单',
      'paid': '已支付',
      'completed': '已完成',
      'active': '待接单'
    }
  },

  onLoad(options) {
    this.enableShareMenu()
    const { type, id } = options
    this.setData({ type })
    if (id) {
      this.loadDetail(type, id)
    }
  },

  enableShareMenu() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  async loadDetail(type, id) {
    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'detail',
          data: { type, id }
        }
      })

      if (result.code === 0) {
        const detail = result.data
        
        if (detail.time) {
          const timeParts = detail.time.split(' ')
          if (timeParts.length >= 2) {
            detail.date = timeParts[0]
            detail.timeSlot = timeParts.slice(1).join(' ')
          } else {
            detail.date = ''
            detail.timeSlot = detail.time
          }
        }
        
        const currentOpenid = wx.getStorageSync('openid') || ''
        
        console.log('当前用户openid:', currentOpenid)
        console.log('发布者openid:', detail.openid)
        console.log('接单者openid:', detail.acceptorOpenid)

        const isOwner = detail.openid === currentOpenid
        const isAcceptor = detail.acceptorOpenid === currentOpenid
        const isVisitor = !isOwner && !isAcceptor

        console.log('身份判断 - isOwner:', isOwner, 'isAcceptor:', isAcceptor, 'isVisitor:', isVisitor)

        this.setData({
          detail,
          isOwner,
          isAcceptor,
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
    // 获取对方学号
    let otherOpenid = ''
    
    if (isOwner) {
      // 发布者：拼车和找搭子显示联系过的人列表
      if (detail.type === 'carpool' || detail.type === 'partner') {
        navigateTo(`/pages/chat/buyerList?relatedId=${detail._id}&relatedType=help-${detail.type}`)
        return
      }
      // 代取快递/其他互助：如果有接单者，发给接单者
      if (detail.acceptorOpenid) {
        otherOpenid = detail.acceptorOpenid
      } else {
        showToast('还没有接单者')
        return
      }
    } else {
      // 浏览者：发给发布者
      if (detail.openid) {
        otherOpenid = detail.openid
      } else {
        showToast('发布者信息不存在')
        return
      }
    }

    navigateTo(`/pages/chat/chat?otherOpenid=${otherOpenid}&relatedId=${detail._id}&relatedType=help-${detail.type}`)
  },

  async updateStatus() {
    if (!requireLogin()) return

    const { detail, type } = this.data
    
    if (detail.status === 'completed') return
    
    if (type !== 'express' && type !== 'other' && detail.status !== 'active') return

    const { confirm } = await wx.showModal({
      title: '提示',
      content: '确定要标记为已完成吗？'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'updateStatus',
          data: {
            type: this.data.type,
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
        this.sendNotification('orderComplete')
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
    if (!requireLogin()) return
    navigateTo(`/pages/help/publish?type=${this.data.type}&id=${this.data.detail._id}`)
  },

  async acceptExpress() {
    if (!requireLogin()) return

    const { detail } = this.data
    
    if (!detail) {
      showToast('详情信息不存在')
      return
    }
    
    let confirmContent = ''
    if (detail.type === 'express') {
      confirmContent = `取件码：${detail.pickupCode}\n收件人：${detail.recipient}\n酬金：¥${detail.reward}（已预付托管）\n确定要接单吗？`
    } else if (detail.type === 'other') {
      confirmContent = `标题：${detail.title}\n地点：${detail.location}\n酬金：¥${detail.reward}（已预付托管）\n确定要接单吗？`
    }
    
    const { confirm } = await wx.showModal({
      title: '确认接单',
      content: confirmContent
    })

    if (!confirm) return

    showLoading('接单中...')
    try {
      const currentOpenid = wx.getStorageSync('openid')
      const cloudResult = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'accept',
          data: {
            id: detail._id,
            type: detail.type
          }
        },
        timeout: 10000
      })
      
      if (!cloudResult || !cloudResult.result) {
        throw new Error('云函数调用失败')
      }
      
      const { result } = cloudResult
      console.log('接单结果:', result)

      if (result.code === 0) {
        showToast('接单成功')
        this.setData({
          'detail.status': 'accepted',
          'detail.acceptorOpenid': currentOpenid,
          isAcceptor: true,
          isVisitor: false
        })
        
        this.requestSubscribeMessage('acceptor')
        this.sendNotification('orderAccept')
      } else {
        showToast(result.msg || '接单失败')
      }
    } catch (error) {
      console.error('接单失败:', error)
      showToast(`接单失败: ${error.message || '未知错误'}`)
    } finally {
      hideLoading()
    }
  },

  // 发布者预支付（担保交易：先付钱到平台，完成后才打给接单者）
  async payToEscrow() {
    if (!requireLogin()) return

    const { detail } = this.data

    const { confirm } = await wx.showModal({
      title: '确认支付',
      content: `支付金额：¥${detail.reward}\n支付后资金由平台托管，确认完成后才会打给接单者\n确定支付吗？`
    })

    if (!confirm) return

    showLoading('支付中...')
    let outTradeNo = ''
    try {
      const description = detail.type === 'express'
        ? `代取快递酬金 ¥${detail.reward}`
        : `互助酬金 ¥${detail.reward}`

      const { result } = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          action: 'unifiedOrder',
          data: {
            itemId: detail._id,
            amount: detail.reward,
            description,
            itemType: detail.type
          }
        }
      })

      console.log('支付云函数返回:', JSON.stringify(result, null, 2))

      if (result.code !== 0) {
        showToast(result.msg || '支付失败')
        return
      }

      const paymentParams = result.data.payment
      outTradeNo = result.data.outTradeNo

      console.log('支付参数 paymentParams:', JSON.stringify(paymentParams, null, 2))
      console.log('outTradeNo:', outTradeNo)

      wx.hideLoading()

      await wx.requestPayment(paymentParams)

      showToast('支付成功', 'success')
      this.setData({
        'detail.status': 'prepaid'
      })
    } catch (error) {
      console.error('支付失败:', error)
      if (error.errMsg && error.errMsg.includes('requestPayment:fail')) {
        showToast('支付已取消')
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
      content: '确定要删除这条信息吗？',
      confirmColor: '#f44336'
    })

    if (!confirm) return

    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'delete',
          data: {
            type: this.data.type,
            id: this.data.detail._id
          }
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
  
  async getTemplateIds() {
    const localTemplateIds = Object.values(TEMPLATES).filter(id => id)
    if (localTemplateIds.length > 0) return TEMPLATES

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'getTemplateIds',
          data: {}
        }
      })
      if (result && result.code === 0) {
        return result.data || {}
      }
    } catch (error) {
      console.log('Failed to load subscribe template ids:', error)
    }

    return TEMPLATES
  },

  async requestSubscribeMessage(role) {
    const templates = await this.getTemplateIds()
    let tmplIds = []
    if (role === 'acceptor') {
      if (templates.ORDER_PAY) tmplIds.push(templates.ORDER_PAY)
    } else {
      if (templates.ORDER_ACCEPT) tmplIds.push(templates.ORDER_ACCEPT)
      if (templates.ORDER_COMPLETE) tmplIds.push(templates.ORDER_COMPLETE)
    }
    
    if (tmplIds.length === 0) return
    
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        console.log('订阅消息授权结果:', res)
      },
      fail: (err) => {
        console.log('订阅消息授权失败:', err)
      }
    })
  },
  
  async sendNotification(action) {
    const { detail } = this.data
    try {
      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action,
          data: {
            publisherOpenid: detail.openid,
            acceptorOpenid: detail.acceptorOpenid,
            type: detail.type,
            orderId: detail._id,
            title: detail.title || detail.from || '互助任务',
            reward: detail.reward
          }
        }
      })
    } catch (error) {
      console.error('发送通知失败:', error)
    }
  },

  getShareTitle() {
    const detail = this.data.detail || {}
    return detail.title || detail.from || detail.description || '校园互助信息'
  },

  onShareAppMessage() {
    const detail = this.data.detail || {}
    const type = this.data.type || detail.type || ''
    return {
      title: `互助信息：${this.getShareTitle()}`,
      path: detail._id && type ? `/pages/help/detail?type=${type}&id=${detail._id}` : '/pages/help/help'
    }
  },

  onShareTimeline() {
    const detail = this.data.detail || {}
    const type = this.data.type || detail.type || ''
    return {
      title: `互助信息：${this.getShareTitle()}`,
      query: detail._id && type ? `type=${type}&id=${detail._id}` : ''
    }
  }
})
