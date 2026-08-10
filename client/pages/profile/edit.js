const { showLoading, hideLoading, showToast, navigateBack, uploadImage } = require('../../utils/util.js')

Page({
  data: {
    form: {
      nickName: '',
      stuId: '',
      phone: '',
      avatarUrl: ''
    }
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo')
    this.setData({
      form: {
        nickName: userInfo.nickName || '',
        stuId: userInfo.stuId || '',
        phone: userInfo.phone || '',
        avatarUrl: userInfo.avatarUrl || ''
      }
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`form.${field}`]: value
    })
  },

  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadAvatar(tempFilePath)
      }
    })
  },

  async uploadAvatar(filePath) {
    showLoading('上传中...')
    try {
      const fileID = await uploadImage(filePath)
      this.setData({
        'form.avatarUrl': fileID
      })
      hideLoading()
    } catch (error) {
      hideLoading()
      console.error('上传头像失败:', error)
    }
  },

  async submit() {
    const { nickName, phone, avatarUrl } = this.data.form

    if (!nickName.trim()) {
      showToast('请输入昵称')
      return
    }

    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      showToast('请输入正确的手机号')
      return
    }

    showLoading('保存中...')

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'update',
          data: this.data.form
        }
      })

      if (result.code === 0) {
        // 合并保存，保留姓名等原有字段，避免学号/姓名丢失
        const userInfo = wx.getStorageSync('userInfo') || {}
        wx.setStorageSync('userInfo', { ...userInfo, ...this.data.form })
        showToast('保存成功', 'success')
        setTimeout(() => {
          navigateBack()
        }, 1500)
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
