const { showLoading, hideLoading, showToast, navigateBack } = require('../../../utils/util.js')

Page({
  data: {
    show: true,
    title: '',
    content: '',
    bannerList: []
  },

  onLoad() {
    this.loadConfig()
  },

  async loadConfig() {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: { action: 'getHomeConfig' }
      })
      if (result && result.code === 0) {
        const config = result.data || {}
        const announcement = config.announcement || {}
        this.setData({
          show: announcement.show !== false,
          title: announcement.title || '',
          content: announcement.content || '',
          bannerList: config.bannerList || []
        })
      } else {
        showToast((result && result.msg) || '加载失败')
      }
    } catch (error) {
      console.error('加载公告失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  onShowChange(e) {
    this.setData({ show: e.detail.value })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  async submit() {
    const title = this.data.title.trim()
    const content = this.data.content.trim()
    if (this.data.show && !content) {
      showToast('请输入公告内容')
      return
    }

    showLoading('保存中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList: this.data.bannerList,
            announcement: {
              show: this.data.show,
              title: title || '平台公告',
              content
            }
          }
        }
      })

      if (result && result.code === 0) {
        wx.removeStorageSync('cache:home:index')
        showToast('公告已发布', 'success')
        setTimeout(() => navigateBack(), 1200)
      } else {
        showToast((result && result.msg) || '保存失败')
      }
    } catch (error) {
      console.error('保存公告失败:', error)
      showToast('保存失败，请确认 config 云函数已部署')
    } finally {
      hideLoading()
    }
  }
})
