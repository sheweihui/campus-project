const { showLoading, hideLoading, showToast, navigateBack } = require('/utils/util.js')

Page({
  data: {
    isEdit: false,
    orderId: '',
    typeIndex: 0,
    typeOptions: [
      { key: 'market', label: '二手市场' },
      { key: 'lostfound', label: '失物招领' },
      { key: 'help', label: '校园互助' },
      { key: 'other', label: '其他' }
    ],
    paymentIndex: 0,
    paymentOptions: [
      { key: 'paid', label: '已支付' },
      { key: 'pending', label: '未支付' },
      { key: 'confirmed', label: '已确认' }
    ],
    orderStatusIndex: 0,
    orderStatusOptions: [
      { key: 'completed', label: '已完成' },
      { key: 'pending', label: '进行中' },
      { key: 'cancelled', label: '已取消' }
    ],
    form: {
      amount: '',
      buyerNickName: '',
      sellerNickName: '',
      remark: ''
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, orderId: options.id })
      this.loadOrder(options.id)
    }
  },

  async loadOrder(orderId) {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'getOrderDetail', data: { orderId } }
      })
      if (result.code === 0) {
        const o = result.data
        const typeIndex = Math.max(0, this.data.typeOptions.findIndex(t => t.key === o.type))
        const paymentIndex = Math.max(0, this.data.paymentOptions.findIndex(p => p.key === o.paymentStatus))
        const orderStatusIndex = Math.max(0, this.data.orderStatusOptions.findIndex(s => s.key === o.orderStatus))
        this.setData({
          typeIndex,
          paymentIndex,
          orderStatusIndex,
          form: {
            amount: o.amount != null ? String(o.amount) : '',
            buyerNickName: o.buyerNickName || '',
            sellerNickName: o.sellerNickName || '',
            remark: o.remark || ''
          }
        })
      } else {
        showToast(result.msg || '加载失败')
      }
    } catch (error) {
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) })
  },

  onPaymentChange(e) {
    const paymentIndex = Number(e.detail.value)
    const isPaid = this.data.paymentOptions[paymentIndex].key !== 'pending'
    this.setData({
      paymentIndex,
      orderStatusIndex: isPaid ? 0 : this.data.orderStatusIndex
    })
  },

  onStatusChange(e) {
    this.setData({ orderStatusIndex: Number(e.detail.value) })
  },

  async submit() {
    const { isEdit, orderId, typeIndex, paymentIndex, orderStatusIndex, typeOptions, paymentOptions, orderStatusOptions, form } = this.data
    const type = typeOptions[typeIndex].key
    const paymentStatus = paymentOptions[paymentIndex].key
    const orderStatus = orderStatusOptions[orderStatusIndex].key
    const amount = Number(form.amount)

    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      showToast('请输入正确的订单金额')
      return
    }
    if (!form.buyerNickName.trim() && !form.sellerNickName.trim()) {
      showToast('请至少填写买家或卖家昵称')
      return
    }

    showLoading('提交中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: isEdit ? 'updateOrder' : 'createOrder',
          data: {
            orderId,
            type,
            amount,
            buyerNickName: form.buyerNickName.trim(),
            sellerNickName: form.sellerNickName.trim(),
            paymentStatus,
            orderStatus,
            remark: form.remark.trim()
          }
        }
      })
      if (result.code === 0) {
        showToast(isEdit ? '修改成功' : '创建成功', 'success')
        setTimeout(() => navigateBack(), 1500)
      } else {
        showToast(result.msg || '提交失败')
      }
    } catch (error) {
      console.error('提交订单失败:', error)
      showToast('提交失败')
    } finally {
      hideLoading()
    }
  }
})
