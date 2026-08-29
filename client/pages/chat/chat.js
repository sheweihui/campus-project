const { showToast } = require('../../utils/util.js')
const TEMPLATES = require('../../config/templateIds.js')

Page({
  data: {
    messages: [],
    inputText: '',
    toView: '',
    myOpenid: '',
    otherOpenid: '',
    otherUserInfo: {},
    relatedId: '',
    relatedType: '',
    timer: null
  },

  onLoad(options) {
    const { otherOpenid, relatedId, relatedType } = options
    const myOpenid = wx.getStorageSync('openid')
    
    if (!myOpenid) {
      showToast('请先登录后再聊天')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    if (!otherOpenid) {
      showToast('对方信息不存在')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }
    
    this.setData({
      myOpenid,
      otherOpenid,
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
        name: 'user',
        data: {
          action: 'getPublicInfo',
          data: { targetOpenid: this.data.otherOpenid }
        }
      })
      
      if (res.result.code === 0) {
        this.setData({ otherUserInfo: res.result.data })
      } else {
        // 如果获取不到用户信息，使用学号作为显示名
        this.setData({ 
          otherUserInfo: { 
            nickName: '用户',
            openid: this.data.otherOpenid
          } 
        })
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 如果获取失败，使用学号作为显示名
      this.setData({ 
        otherUserInfo: { 
          nickName: '用户',
          openid: this.data.otherOpenid
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
            myOpenid: this.data.myOpenid,
            otherOpenid: this.data.otherOpenid,
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

  async getTemplateIds() {
    const localTemplateIds = Object.values(TEMPLATES).filter(id => id)
    if (localTemplateIds.length > 0) return TEMPLATES

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'getTemplateIds',
          data: {}
        }
      })
      if (result && result.code === 0) {
        return result.data || {}
      }
    } catch (error) {
      console.log('Failed to load subscribe template ids:', error)
    }

    return TEMPLATES
  },

  async requestChatSubscribe() {
    const templates = await this.getTemplateIds()
    const templateId = templates.CHAT_MESSAGE
    if (!templateId) {
      showToast('未配置聊天消息模板ID')
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res[templateId] === 'accept') {
          showToast('已开启一次消息提醒', 'success')
        } else {
          showToast('未授权消息提醒')
        }
      },
      fail: (err) => {
        console.log('聊天订阅消息授权失败:', err)
        showToast('授权失败')
      }
    })
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
            senderId: this.data.myOpenid,
            receiverId: this.data.otherOpenid,
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
