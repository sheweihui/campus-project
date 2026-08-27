const { showLoading, hideLoading, showToast, navigateBack, callCloudFunction } = require('../../../utils/util.js')

const CONFIG_REQUEST_TIMEOUT = 12000

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
    let loading = true
    try {
      const { result } = await callCloudFunction({
        name: 'config',
        data: { action: 'getHomeConfig' }
      }, CONFIG_REQUEST_TIMEOUT)
      hideLoading()
      loading = false
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
      if (loading) {
        hideLoading()
        loading = false
      }
      showToast(error && error.message && error.message.indexOf('timeout') >= 0 ? '加载超时，请稍后重试' : '加载失败')
    } finally {
      if (loading) {
        hideLoading()
      }
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
    let loading = true
    try {
      const { result } = await callCloudFunction({
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
      }, CONFIG_REQUEST_TIMEOUT)

      hideLoading()
      loading = false

      if (result && result.code === 0) {
        const homeCache = wx.getStorageSync('cache:home:index')
        if (homeCache && homeCache.data && result.data && result.data.announcement) {
          wx.setStorageSync('cache:home:index', {
            data: Object.assign({}, homeCache.data, {
              announcement: result.data.announcement
            }),
            timestamp: Date.now()
          })
        } else {
          wx.removeStorageSync('cache:home:index')
        }
        showToast('公告已发布', 'success')
        setTimeout(() => navigateBack(), 1200)
      } else {
        showToast((result && result.msg) || '保存失败')
      }
    } catch (error) {
      console.error('保存公告失败:', error)
      if (loading) {
        hideLoading()
        loading = false
      }
      showToast(error && error.message && error.message.indexOf('timeout') >= 0 ? '保存超时，请稍后重试' : '保存失败，请确认 config 云函数已部署')
    } finally {
      if (loading) {
        hideLoading()
      }
    }
  }
})
