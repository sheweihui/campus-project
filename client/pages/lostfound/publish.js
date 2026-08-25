const { showLoading, hideLoading, showToast, navigateBack, uploadImage, requireLogin, getRecommendPhone } = require('../../utils/util.js')

Page({
  data: {
    id: '',
    recommendPhone: '',
    form: {
      type: 'lost',
      title: '',
      description: '',
      location: '',
      time: '',
      contact: '',
      images: []
    },
    timeRange: [
      ['今天', '昨天', '前天', '更早'],
      ['早上', '中午', '下午', '晚上']
    ],
    timeIndex: [0, 0]
  },

  onLoad(options) {
    this.setData({ recommendPhone: getRecommendPhone() })
    if (options.id) {
      this.setData({ id: options.id })
    }

    if (options.type) {
      this.setData({
        'form.type': options.type
      })
    }
    
    if (options.id) {
      this.loadPostData(options.id)
    }
  },
  
  async loadPostData(id) {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: 'detail',
          data: { id }
        }
      })
      
      if (result.code === 0) {
        this.setData({
          form: result.data
        })
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      showToast('加载数据失败')
    } finally {
      hideLoading()
    }
  },

  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'form.type': type
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`form.${field}`]: value
    })
  },

  // 一键填入推荐手机号
  fillPhone(e) {
    const field = e.currentTarget.dataset.field || 'contact'
    if (!this.data.recommendPhone) return
    this.setData({
      [`form.${field}`]: this.data.recommendPhone
    })
  },

  onTimeChange(e) {
    const value = e.detail.value
    const date = this.data.timeRange[0][value[0]]
    const time = this.data.timeRange[1][value[1]]
    this.setData({
      'form.time': `${date}${time}`,
      timeIndex: value
    })
  },

  async chooseImage() {
    try {
      const { tempFilePaths } = await wx.chooseImage({
        count: 6 - this.data.form.images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })

      showLoading('上传中...')
      
      const uploadTasks = tempFilePaths.map(filePath => uploadImage(filePath))
      const fileIDs = await Promise.all(uploadTasks)
      
      this.setData({
        'form.images': [...this.data.form.images, ...fileIDs]
      })
      
      hideLoading()
    } catch (error) {
      hideLoading()
      console.error('上传图片失败:', error)
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      urls: this.data.form.images,
      current: url
    })
  },

  deleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.form.images
    images.splice(index, 1)
    this.setData({
      'form.images': images
    })
  },

  async submit() {
    if (!requireLogin()) return

    const { type, title, description, contact } = this.data.form
    
    if (!title.trim()) {
      showToast('请输入物品名称')
      return
    }
    
    if (!description.trim()) {
      showToast('请输入物品描述')
      return
    }
    
    if (!contact.trim()) {
      showToast('请输入联系方式')
      return
    }

    showLoading('提交中...')

    try {
      // 清理只读/服务端字段，避免编辑时写脏数据
      const {
        _id,
        openid,
        stuId: formStuId,
        status,
        createTime,
        updateTime,
        ...cleanForm
      } = this.data.form

      const payload = { ...cleanForm }
      if (this.data.id) {
        payload.id = this.data.id
      }

      const { result } = await wx.cloud.callFunction({
        name: 'lostfound',
        data: {
          action: this.data.id ? 'update' : 'add',
          data: payload
        }
      })

      if (result.code === 0) {
        showToast(this.data.id ? '修改成功' : '发布成功', 'success')
        setTimeout(() => {
          navigateBack()
        }, 1500)
      } else {
        showToast(result.msg || (this.data.id ? '修改失败' : '发布失败'))
      }
    } catch (error) {
      console.error('提交失败:', error)
      showToast('提交失败')
    } finally {
      hideLoading()
    }
  }
})
