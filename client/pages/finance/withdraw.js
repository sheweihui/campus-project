const { showLoading, hideLoading, showToast, navigateTo, navigateBack } = require('../../utils/util.js')

Page({
  data: {
    finance: null,
    withdrawAmount: '',
    wechat: '',
    realName: '',
    remark: ''
  },

  onLoad() {
    this.loadFinance()
  },

  async loadFinance() {
    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'getFinance'
        }
      })

      if (result.code === 0) {
        this.setData({ finance: result.data })
      }
    } catch (error) {
      console.error('加载财务信息失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  onAmountInput(e) {
    this.setData({ withdrawAmount: e.detail.value })
  },

  onWechatInput(e) {
    this.setData({ wechat: e.detail.value })
  },

  onNameInput(e) {
    this.setData({ realName: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  get canSubmit() {
    const { withdrawAmount, realName } = this.data
    const amount = parseFloat(withdrawAmount)
    
    if (!amount || amount <= 0) {
      return false
    }
    
    if (amount < 10) {
      return false
    }
    
    if (amount > this.data.finance.availableAmount) {
      return false
    }
    
    if (!realName.trim()) {
      return false
    }
    
    return true
  },

  async submitWithdraw() {
    if (!this.canSubmit) {
      showToast('请填写完整信息')
      return
    }

    const { confirm } = await wx.showModal({
      title: '确认提现',
      content: `提现金额：¥${this.data.withdrawAmount}\n收款姓名：${this.data.realName}`,
      confirmText: '确认提交',
      cancelText: '取消'
    })

    if (!confirm) return

    showLoading('提现中...')
    try {
      const partnerTradeNo = `WITHDRAW_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const { result } = await wx.cloud.callFunction({
        name: 'transfer',
        data: {
          action: 'transfer',
          data: {
            amount: parseFloat(this.data.withdrawAmount),
            partnerTradeNo,
            realName: this.data.realName,
            remark: this.data.remark || '互助酬金提现'
          }
        }
      })

      if (result.code === 0) {
        showToast('提现成功，款项将在1-3个工作日到账', 'success')
        setTimeout(() => {
          navigateBack()
        }, 2000)
      } else {
        showToast(result.msg || '提现失败')
      }
    } catch (error) {
      console.error('提现失败:', error)
      showToast('提现失败')
    } finally {
      hideLoading()
    }
  }
})