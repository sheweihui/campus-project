const { showToast, isGuest } = require('../../utils/util.js')

Page({
  data: {
    messages: [],
    inputText: '',
    toView: '',
    myStuId: '',
    otherStuId: '',
    otherUserInfo: {},
    relatedId: '',
    relatedType: '',
    timer: null
  },

  onLoad(options) {
    const { otherStuId, relatedId, relatedType } = options
    const myStuId = wx.getStorageSync('stuId')
    
    if (isGuest() || !myStuId) {
      showToast('请先登录后再聊天')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    if (!otherStuId) {
      showToast('对方信息不存在')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }
    
    this.setData({
      myStuId,
      otherStuId,
      relatedId,
      relatedType
    })

    this.loadOtherUserInfo()
    this.loadMessages()
    this.startPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  async loadOtherUserInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'student',
        data: {
          action: 'getInfo',
          data: { stuId: this.data.otherStuId }
        }
      })
      
      if (res.result.code === 0) {
        this.setData({ otherUserInfo: res.result.data })
      } else {
        // 如果获取不到用户信息，使用学号作为显示名
        this.setData({ 
          otherUserInfo: { 
            name: this.data.otherStuId,
            stuId: this.data.otherStuId
          } 
        })
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 如果获取失败，使用学号作为显示名
      this.setData({ 
        otherUserInfo: { 
          name: this.data.otherStuId,
          stuId: this.data.otherStuId
        } 
      })
    }
  },

  async loadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'chat',
        data: {
          action: 'list',
          data: {
            myStuId: this.data.myStuId,
            otherStuId: this.data.otherStuId,
            relatedId: this.data.relatedId
          }
        }
      })

      if (res.result.code === 0) {
        const messages = res.result.data.map(msg => ({
          ...msg,
          time: this.formatTime(msg.createTime)
        }))
        
        this.setData({ 
          messages,
          toView: messages.length > 0 ? `msg-${messages.length - 1}` : ''
        })
      }
    } catch (error) {
      console.error('加载消息失败:', error)
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  async sendMessage() {
    const content = this.data.inputText.trim()
    
    if (!content) {
      showToast('请输入消息')
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'chat',
        data: {
          action: 'send',
          data: {
            senderId: this.data.myStuId,
            receiverId: this.data.otherStuId,
            content,
            relatedId: this.data.relatedId,
            relatedType: this.data.relatedType
          }
        }
      })

      if (res.result.code === 0) {
        this.setData({ inputText: '' })
        this.loadMessages()
      } else {
        showToast(res.result.msg || '发送失败')
      }
    } catch (error) {
      console.error('发送消息失败:', error)
      showToast('发送失败')
    }
  },

  startPolling() {
    this.data.timer = setInterval(() => {
      this.loadMessages()
    }, 3000)
  },

  stopPolling() {
    if (this.data.timer) {
      clearInterval(this.data.timer)
    }
  },

  formatTime(time) {
    if (!time) return ''
    const date = new Date(time)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) {
      return '刚刚'
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`
    } else {
      return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
    }
  }
})
