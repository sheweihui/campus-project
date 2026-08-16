const { showLoading, hideLoading, showToast, navigateTo } = require('../../utils/util.js')

Page({
  data: {
    isAdmin: false,
    settings: {
      messageNotify: true,
      showPhone: false
    },
    feedbackTypes: ['功能建议', 'Bug反馈', '使用问题', '其他'],
    feedbackTypeIndex: 0,
    feedback: {
      type: '',
      content: '',
      contact: ''
    }
  },

  onLoad() {
    this.loadSettings()
    this.checkAdmin()
  },

  // 检查是否商家端管理员
  async checkAdmin() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'checkAdmin' }
      })
      this.setData({ isAdmin: !!(result && result.code === 0) })
    } catch (error) {
      this.setData({ isAdmin: false })
    }
  },

  // 切换商家端
  goToMerchant() {
    wx.navigateTo({ url: '/pages/merchant/dashboard/dashboard' })
  },

  loadSettings() {
    const settings = wx.getStorageSync('settings')
    if (settings) {
      this.setData({
        settings
      })
    }
  },

  onSettingChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`settings.${field}`]: value
    })
    
    const settings = this.data.settings
    wx.setStorageSync('settings', settings)
  },

  onTypeChange(e) {
    const index = e.detail.value
    this.setData({
      feedbackTypeIndex: index,
      'feedback.type': this.data.feedbackTypes[index]
    })
  },

  onFeedbackInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`feedback.${field}`]: value
    })
  },

  async submitFeedback() {
    const { type, content, contact } = this.data.feedback

    if (!content.trim()) {
      showToast('请输入反馈内容')
      return
    }

    showLoading('提交中...')

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feedback',
        data: {
          action: 'add',
          data: { type, content, contact }
        }
      })

      if (result.code === 0) {
        showToast('提交成功', 'success')
        this.setData({
          feedback: {
            type: '',
            content: '',
            contact: ''
          }
        })
      } else {
        showToast(result.msg || '提交失败')
      }
    } catch (error) {
      console.error('提交反馈失败:', error)
      const errMsg = (error && (error.errMsg || error.message)) || ''
      showToast(errMsg ? `提交失败：${errMsg}` : '提交失败，请确认 feedback 云函数已部署')
    } finally {
      hideLoading()
    }
  },

  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除缓存吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
            showToast('清除成功', 'success')
          } catch (error) {
            showToast('清除失败')
          }
        }
      }
    })
  },

  showAbout() {
    wx.showModal({
      title: '关于校园便利圈',
      content: '版本：1.0.0\n\n校园便利圈是一款为大学生打造的便民服务小程序，提供失物招领、二手集市、校园互助等功能。',
      showCancel: false
    })
  },

  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
            wx.reLaunch({
              url: '/pages/login/login'
            })
          } catch (error) {
            showToast('退出失败')
          }
        }
      }
    })
  }
})
