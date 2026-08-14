const { showLoading, hideLoading, showToast, navigateBack } = require('../../../utils/util.js')

Page({
  data: {
    title: '',
    content: ''
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  async submit() {
    const content = this.data.content.trim()
    if (!content) {
      showToast('请输入消息内容')
      return
    }

    const { confirm } = await wx.showModal({
      title: '确认群发',
      content: '将把该消息群发给所有注册用户，确定发送？',
      confirmText: '发送',
      confirmColor: '#e64340'
    })
    if (!confirm) return

    showLoading('发送中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'broadcastMessage',
          data: {
            title: this.data.title,
            content
          }
        }
      })

      if (result.code === 0) {
        showToast(result.msg || '群发成功', 'success')
        setTimeout(() => navigateBack(), 1800)
      } else {
        showToast(result.msg || '群发失败')
      }
    } catch (error) {
      console.error('群发失败:', error)
      showToast('群发失败，请确认 admin 云函数已部署')
    } finally {
      hideLoading()
    }
  }
})