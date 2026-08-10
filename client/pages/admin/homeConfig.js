const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

Page({
  data: {
    bannerList: [],
    announcement: {
      show: false,
      title: '',
      content: ''
    }
  },

  onLoad() {
    this.loadConfig()
  },

  async loadConfig() {
    showLoading()
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: { action: 'getHomeConfig' }
      })
      if (result.code === 0 && result.data) {
        // 兼容字符串格式（banner 管理页写入）与对象格式（本页写入）
        const bannerList = (result.data.bannerList || []).map((item, index) =>
          typeof item === 'string'
            ? { id: `banner_${index}_${Date.now()}`, image: item, link: '' }
            : item
        )
        this.setData({
          bannerList,
          announcement: result.data.announcement || { show: false }
        })
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      showToast('加载配置失败')
    } finally {
      hideLoading()
    }
  },

  async chooseImage(e) {
    const index = e.currentTarget.dataset.index
    const { tempFilePaths } = await wx.chooseImage({ count: 1 })
    if (tempFilePaths.length > 0) {
      showLoading('上传中...')
      try {
        const fileName = `banner_${Date.now()}.png`
        const { fileID } = await wx.cloud.uploadFile({
          cloudPath: `banners/${fileName}`,
          filePath: tempFilePaths[0]
        })
        const bannerList = this.data.bannerList
        bannerList[index].image = fileID
        this.setData({ bannerList })
      } catch (error) {
        console.error('上传失败:', error)
        showToast('上传失败')
      } finally {
        hideLoading()
      }
    }
  },

  async addBanner() {
    const { tempFilePaths } = await wx.chooseImage({ count: 1 })
    if (tempFilePaths.length > 0) {
      showLoading('上传中...')
      try {
        const fileName = `banner_${Date.now()}.png`
        const { fileID } = await wx.cloud.uploadFile({
          cloudPath: `banners/${fileName}`,
          filePath: tempFilePaths[0]
        })
        const bannerList = this.data.bannerList
        bannerList.push({ id: Date.now(), image: fileID, link: '' })
        this.setData({ bannerList })
      } catch (error) {
        console.error('上传失败:', error)
        showToast('上传失败')
      } finally {
        hideLoading()
      }
    }
  },

  removeBanner(e) {
    const index = e.currentTarget.dataset.index
    const bannerList = this.data.bannerList
    bannerList.splice(index, 1)
    this.setData({ bannerList })
  },

  toggleAnnouncement(e) {
    const announcement = { ...this.data.announcement, show: e.detail.value }
    this.setData({ announcement })
  },

  inputTitle(e) {
    const announcement = { ...this.data.announcement, title: e.detail.value }
    this.setData({ announcement })
  },

  inputContent(e) {
    const announcement = { ...this.data.announcement, content: e.detail.value }
    this.setData({ announcement })
  },

  async saveConfig() {
    showLoading('保存中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList: this.data.bannerList,
            announcement: this.data.announcement
          }
        }
      })
      if (result.code === 0) {
        showToast('保存成功', 'success')
      } else {
        showToast(result.msg || '保存失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      showToast('保存失败')
    } finally {
      hideLoading()
    }
  }
})
