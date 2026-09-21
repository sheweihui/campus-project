const { showToast, showLoading, hideLoading, navigateBack } = require('../../utils/util.js')

Page({
  data: {
    name: '',
    stuId: '',
    submitting: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    this.setData({
      name: userInfo.name || '',
      stuId: userInfo.stuId || ''
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  async submit() {
    if (this.data.submitting) return

    const name = (this.data.name || '').trim()
    const stuId = (this.data.stuId || '').trim()

    if (!name) {
      showToast('请输入真实姓名')
      return
    }
    if (!stuId) {
      showToast('请输入学号')
      return
    }

    this.setData({ submitting: true })
    showLoading('保存中...')

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'update',
          data: { name, stuId }
        }
      })

      if (result && result.code === 0) {
        const userInfo = wx.getStorageSync('userInfo') || {}
        wx.setStorageSync('userInfo', { ...userInfo, name, stuId })
        hideLoading()
        this.setData({ submitting: false })
        showToast('保存成功', 'success')
        setTimeout(() => navigateBack(), 800)
      } else {
        hideLoading()
        this.setData({ submitting: false })
        showToast((result && result.msg) || '保存失败')
      }
    } catch (error) {
      hideLoading()
      this.setData({ submitting: false })
      showToast('保存失败，请重试')
    }
  }
})
