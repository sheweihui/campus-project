const { showLoading, hideLoading, showToast, navigateTo, navigateBack, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    finance: null,
    withdrawAmount: '',
    realName: '',
    bankCard: '',
    remark: '',
    canSubmit: false
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
        this.updateCanSubmit()
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
    this.updateCanSubmit()
  },

  onNameInput(e) {
    this.setData({ realName: e.detail.value })
    this.updateCanSubmit()
  },

  onBankCardInput(e) {
    this.setData({ bankCard: e.detail.value })
    this.updateCanSubmit()
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  updateCanSubmit() {
    const { withdrawAmount, realName, bankCard, finance } = this.data
    const amount = parseFloat(withdrawAmount)
    const available = (finance && finance.availableAmount) || 0

    const canSubmit = !!(
      amount > 0 &&
      amount >= 1 &&
      amount <= available &&
      realName && realName.trim() &&
      bankCard && bankCard.trim()
    )
    this.setData({ canSubmit })
  },

  async submitWithdraw() {
    if (!requireLogin()) return

    if (!this.data.canSubmit) {
      showToast('请填写完整信息')
      return
    }

    const { confirm } = await wx.showModal({
      title: '确认提现',
      content: `提现金额：¥${this.data.withdrawAmount}\n持卡人：${this.data.realName}\n银行卡号：${this.data.bankCard}`,
      confirmText: '确认提交',
      cancelText: '取消'
    })

    if (!confirm) return

    showLoading('提交中...')
    let res
    try {
      const partnerTradeNo = `WITHDRAW_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      res = await wx.cloud.callFunction({
        name: 'transfer',
        data: {
          action: 'transfer',
          data: {
            amount: parseFloat(this.data.withdrawAmount),
            partnerTradeNo,
            realName: this.data.realName,
            bankCard: this.data.bankCard,
            remark: this.data.remark || '互助酬金提现'
          }
        }
      })
    } catch (error) {
      console.error('提现失败:', error)
      hideLoading()
      showToast('提现失败，请确认 transfer 云函数已部署')
      return
    }
    hideLoading()

    const result = res && res.result
    if (result && result.code === 0) {
      showToast('提现申请已提交，等待平台打款', 'success')
      setTimeout(() => {
        navigateBack()
      }, 2000)
    } else {
      showToast((result && result.msg) || '提现失败')
    }
  }
})
