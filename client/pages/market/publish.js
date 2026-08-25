const { showLoading, hideLoading, showToast, navigateBack, uploadImage, requireLogin, getRecommendPhone } = require('../../utils/util.js')

Page({
  data: {
    id: '',
    recommendPhone: '',
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
    conditionIndex: 0,
    priceHint: '',
    originalPriceHint: ''
  },

  onLoad(options) {
    this.setData({ recommendPhone: getRecommendPhone() })
    if (options.id) {
      this.setData({ id: options.id })
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

  // 一键填入推荐手机号
  fillPhone(e) {
    const field = e.currentTarget.dataset.field || 'contact'
    if (!this.data.recommendPhone) return
    this.setData({
      [`form.${field}`]: this.data.recommendPhone
    })
  },

  // 价格输入：实时过滤非法字符、限制两位小数，并即时提示
  onPriceInput(e) {
    const value = this.sanitizeAmount(e.detail.value)
    const valid = /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0
    this.setData({
      'form.price': value,
      priceHint: value && !valid ? '请输入大于0的金额，最多两位小数' : ''
    })
  },

  // 原价输入：同样实时过滤与校验（允许为0）
  onOriginalPriceInput(e) {
    const value = this.sanitizeAmount(e.detail.value)
    const valid = /^\d+(\.\d{1,2})?$/.test(value)
    this.setData({
      'form.originalPrice': value,
      originalPriceHint: value && !valid ? '原价最多两位小数' : ''
    })
  },

  // 金额清洗：只保留数字和一个小数点，最多两位小数，小数点开头自动补0
  sanitizeAmount(value) {
    let v = String(value || '').replace(/[^\d.]/g, '')
    const firstDot = v.indexOf('.')
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).slice(0, 2)
    }
    if (v.startsWith('.')) v = '0' + v
    return v
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

    const { title, price, originalPrice, category, condition, description, contact, images } = this.data.form
    
    if (!title.trim()) {
      showToast('请输入商品名称')
      return
    }
    
    if (!price.trim()) {
      showToast('请输入价格')
      return
    }

    // 金额校验：必须为正数且最多两位小数（价格）
    const priceText = price.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(priceText) || Number(priceText) <= 0) {
      showToast('价格必须是大于0的数字，最多两位小数')
      return
    }

    // 金额校验：原价（选填）同样最多两位小数且不能为负
    if (originalPrice && originalPrice.trim()) {
      const originalText = originalPrice.trim()
      if (!/^\d+(\.\d{1,2})?$/.test(originalText) || Number(originalText) < 0) {
        showToast('原价必须是数字，最多两位小数')
        return
      }
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
      const payload = {
        title: title.trim(),
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        category,
        condition,
        description: description.trim(),
        contact: contact.trim(),
        images: images || []
      }
      if (this.data.id) {
        payload.id = this.data.id
      }
      const { result } = await wx.cloud.callFunction({
        name: 'market',
        data: {
          action: this.data.id ? 'update' : 'add',
          data: {
            ...payload
          }
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
