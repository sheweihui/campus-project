const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

Page({
  data: {
    bannerList: [],
    tempImage: '',
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
    showLoading('加载中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'getHomeConfig'
        }
      })
      
      if (res.result.code === 0 && res.result.data) {
        const config = res.result.data
        this.setData({
          bannerList: config.bannerList || [],
          announcement: config.announcement || { show: false, title: '', content: '' }
        })
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadImage(tempFilePath)
      }
    })
  },

  async uploadImage(filePath) {
    showLoading('上传中...')
    try {
      const cloudPath = `banners/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      
      if (uploadRes.fileID) {
        this.setData({ tempImage: uploadRes.fileID })
        showToast('上传成功')
      }
    } catch (error) {
      console.error('上传失败:', error)
      showToast('上传失败')
    } finally {
      hideLoading()
    }
  },

  removeTempImage() {
    this.setData({ tempImage: '' })
  },

  async addBanner() {
    if (!this.data.tempImage) {
      showToast('请先选择图片')
      return
    }

    const newBannerList = [...this.data.bannerList, this.data.tempImage]
    
    showLoading('保存中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList: newBannerList,
            announcement: this.data.announcement
          }
        }
      })
      
      if (res.result.code === 0) {
        this.setData({
          bannerList: newBannerList,
          tempImage: ''
        })
        showToast('添加成功')
      } else {
        showToast(res.result.msg || '保存失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      showToast('保存失败')
    } finally {
      hideLoading()
    }
  },

  async deleteBanner(e) {
    const index = e.currentTarget.dataset.index
    const newBannerList = this.data.bannerList.filter((_, i) => i !== index)
    
    showLoading('删除中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList: newBannerList,
            announcement: this.data.announcement
          }
        }
      })
      
      if (res.result.code === 0) {
        this.setData({ bannerList: newBannerList })
        showToast('删除成功')
      } else {
        showToast(res.result.msg || '删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      showToast('删除失败')
    } finally {
      hideLoading()
    }
  },

  async moveUp(e) {
    const index = e.currentTarget.dataset.index
    if (index <= 0) return
    
    const newBannerList = [...this.data.bannerList]
    const temp = newBannerList[index]
    newBannerList[index] = newBannerList[index - 1]
    newBannerList[index - 1] = temp
    
    await this.saveBannerList(newBannerList)
  },

  async moveDown(e) {
    const index = e.currentTarget.dataset.index
    if (index >= this.data.bannerList.length - 1) return
    
    const newBannerList = [...this.data.bannerList]
    const temp = newBannerList[index]
    newBannerList[index] = newBannerList[index + 1]
    newBannerList[index + 1] = temp
    
    await this.saveBannerList(newBannerList)
  },

  async saveBannerList(bannerList) {
    showLoading('保存中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList,
            announcement: this.data.announcement
          }
        }
      })
      
      if (res.result.code === 0) {
        this.setData({ bannerList })
        showToast('保存成功')
      } else {
        showToast(res.result.msg || '保存失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      showToast('保存失败')
    } finally {
      hideLoading()
    }
  },

  toggleAnnouncement(e) {
    this.setData({
      'announcement.show': e.detail.value
    })
    this.saveAnnouncement()
  },

  inputTitle(e) {
    this.setData({
      'announcement.title': e.detail.value
    })
  },

  inputContent(e) {
    this.setData({
      'announcement.content': e.detail.value
    })
  },

  async saveAnnouncement() {
    showLoading('保存中...')
    try {
      const res = await wx.cloud.callFunction({
        name: 'config',
        data: {
          action: 'updateHomeConfig',
          data: {
            bannerList: this.data.bannerList,
            announcement: this.data.announcement
          }
        }
      })
      
      if (res.result.code === 0) {
        showToast('保存成功')
      } else {
        showToast(res.result.msg || '保存失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      showToast('保存失败')
    } finally {
      hideLoading()
    }
  }
})