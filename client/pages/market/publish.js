const { showLoading, hideLoading, showToast, navigateBack, uploadImage, requireLogin } = require('../../utils/util.js')

Page({
  data: {
    form: {
      title: '',
      price: '',
      originalPrice: '',
      category: '',
      condition: '',
      description: '',
      contact: '',
      images: []
    },
    categories: [
      { name: '书籍', value: 'books' },
      { name: '数码', value: 'digital' },
      { name: '生活用品', value: 'daily' },
      { name: '其他', value: 'others' }
    ],
    conditions: [
      { name: '全新', value: 'new' },
      { name: '99新', value: 'likeNew' },
      { name: '良好', value: 'good' },
      { name: '一般', value: 'fair' }
    ],
    categoryMap: {
      'books': '书籍',
      'digital': '数码',
      'daily': '生活用品',
      'others': '其他'
    },
    conditionMap: {
      'new': '全新',
      'likeNew': '99新',
      'good': '良好',
      'fair': '一般'
    },
    categoryIndex: 0,
    conditionIndex: 0
  },

  onLoad(options) {
    if (options.id) {
      this.loadPostData(options.id)
    } else {
      // 初始化默认值
      this.setData({
        'form.category': this.data.categories[0].value,
        'form.condition': this.data.conditions[0].value
      })
    }
  },
  
  async loadPostData(id) {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: 'detail',
          data: { id }
        }
      })
      
      if (result.code === 0) {
        const form = result.data
        // 计算分类和成色的索引
        const categoryIndex = this.data.categories.findIndex(cat => cat.value === form.category)
        const conditionIndex = this.data.conditions.findIndex(cond => cond.value === form.condition)
        
        this.setData({
          form,
          categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
          conditionIndex: conditionIndex >= 0 ? conditionIndex : 0
        })
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      showToast('加载数据失败')
    } finally {
      hideLoading()
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`form.${field}`]: value
    })
  },

  onCategoryChange(e) {
    const index = e.detail.value
    this.setData({
      categoryIndex: index,
      'form.category': this.data.categories[index].value
    })
  },

  onConditionChange(e) {
    const index = e.detail.value
    this.setData({
      conditionIndex: index,
      'form.condition': this.data.conditions[index].value
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

    const { id, title, price, category, condition, description, contact } = this.data.form
    
    if (!title.trim()) {
      showToast('请输入商品名称')
      return
    }
    
    if (!price.trim()) {
      showToast('请输入价格')
      return
    }
    
    if (!category) {
      showToast('请选择分类')
      return
    }
    
    if (!condition) {
      showToast('请选择成色')
      return
    }
    
    if (!description.trim()) {
      showToast('请输入商品描述')
      return
    }
    
    if (!contact.trim()) {
      showToast('请输入联系方式')
      return
    }

    showLoading('提交中...')

    try {
      const stuId = wx.getStorageSync('stuId') || ''
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: id ? 'update' : 'add',
          data: {
            ...this.data.form,
            stuId,
            price: parseFloat(price),
            originalPrice: this.data.form.originalPrice ? parseFloat(this.data.form.originalPrice) : null
          }
        }
      })

      if (result.code === 0) {
        showToast(id ? '修改成功' : '发布成功', 'success')
        setTimeout(() => {
          navigateBack()
        }, 1500)
      } else {
        showToast(result.msg || (id ? '修改失败' : '发布失败'))
      }
    } catch (error) {
      console.error('提交失败:', error)
      showToast('提交失败')
    } finally {
      hideLoading()
    }
  }
})
