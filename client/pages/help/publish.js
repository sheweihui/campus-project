const { showLoading, hideLoading, showToast, navigateBack, requireLogin } = require('../../utils/util.js')
const TEMPLATES = require('../../config/templateIds.js')

Page({
  data: {
    id: '',
    type: '',
    form: {},
    showDateTimePicker: false,
    pickerTab: 'date',
    pickerYear: 2026,
    pickerMonth: 6,
    selectedDate: '',
    selectedTime: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    timeSlots: [],
    rewardHint: '',
    partnerTypeIndex: 0,
    partnerTypes: [
      { name: '自习', value: 'study' },
      { name: '运动', value: 'sport' },
      { name: '吃饭', value: 'eat' },
      { name: '游戏', value: 'game' },
      { name: '旅游', value: 'travel' },
      { name: '其他', value: 'others' }
    ],
    partnerTypeMap: {
      'study': '自习',
      'sport': '运动',
      'eat': '吃饭',
      'game': '游戏',
      'travel': '旅游',
      'others': '其他'
    }
  },

  onLoad(options) {
    const type = options.type || 'carpool'
    this.setData({
      id: options.id || '',
      type,
      form: this.getEmptyForm(type)
    })
    
    this.initTimeSlots()
    
    if (options.id) {
      this.loadPostData(type, options.id)
    }
  },
  
  initTimeSlots() {
    const slots = []
    for (let i = 0; i < 24; i++) {
      const start = String(i).padStart(2, '0')
      const end = String(i + 1).padStart(2, '0')
      slots.push(`${start}:00-${end}:00`)
    }
    this.setData({ timeSlots: slots })
  },
  
  generateCalendar(year, month) {
    const days = []
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const today = new Date()
    
    const startDay = firstDay.getDay()
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate()
    
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i
      const date = new Date(year, month - 2, day)
      days.push({
        day,
        date: this.formatDate(date),
        type: 'prev'
      })
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month - 1, i)
      const isToday = today.getFullYear() === year && 
                      today.getMonth() + 1 === month && 
                      today.getDate() === i
      const isSelected = this.data.selectedDate === this.formatDate(date)
      
      days.push({
        day: i,
        date: this.formatDate(date),
        type: 'current',
        isToday,
        isSelected
      })
    }
    
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month, i)
      days.push({
        day: i,
        date: this.formatDate(date),
        type: 'next'
      })
    }
    
    this.setData({ calendarDays: days })
  },
  
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },
  
  async loadPostData(type, id) {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: 'detail',
          data: { type, id }
        }
      })
      
      if (result.code === 0) {
        const form = result.data
        if (type === 'partner') {
          const partnerTypeIndex = this.data.partnerTypes.findIndex(pt => pt.value === form.partnerType)
          this.setData({
            form,
            partnerTypeIndex: partnerTypeIndex >= 0 ? partnerTypeIndex : 0
          })
        } else {
          this.setData({ form })
        }
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      showToast('加载数据失败')
    } finally {
      hideLoading()
    }
  },

  getEmptyForm(type) {
    const forms = {
      'carpool': {
        from: '',
        to: '',
        time: '',
        people: '',
        contact: '',
        remark: ''
      },
      'express': {
        pickupLocation: '',
        pickupCode: '',
        recipient: '',
        address: '',
        reward: '',
        deadline: '',
        contact: '',
        remark: ''
      },
      'partner': {
        partnerType: '',
        time: '',
        location: '',
        people: '',
        contact: '',
        description: ''
      },
      'other': {
        title: '',
        time: '',
        location: '',
        reward: '',
        contact: '',
        description: ''
      }
    }
    return forms[type] || forms['carpool']
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`form.${field}`]: value
    })
  },

  // 酬金输入：实时过滤非法字符、限制两位小数，并即时提示
  onRewardInput(e) {
    const value = this.sanitizeAmount(e.detail.value)
    const valid = /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0
    this.setData({
      'form.reward': value,
      rewardHint: value && !valid ? '酬金必须是大于0的金额，最多两位小数' : ''
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

  showDateTimePicker() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    
    const field = this.data.type === 'express' ? 'deadline' : 'time'
    const value = this.data.form[field] || ''
    let selectedDate = ''
    let selectedTime = ''
    
    if (value) {
      const parts = value.split(' ')
      if (parts.length >= 1) selectedDate = parts[0]
      if (parts.length >= 2) selectedTime = parts[1]
    }
    
    this.setData({ 
      showDateTimePicker: true,
      pickerTab: 'date',
      pickerYear: year,
      pickerMonth: month,
      selectedDate,
      selectedTime
    })
    
    this.generateCalendar(year, month)
  },

  hideDateTimePicker() {
    this.setData({ showDateTimePicker: false })
  },
  
  onPickerTap() {},
  
  setPickerTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ pickerTab: tab })
  },
  
  prevMonth() {
    let { pickerYear, pickerMonth } = this.data
    if (pickerMonth === 1) {
      pickerMonth = 12
      pickerYear--
    } else {
      pickerMonth--
    }
    this.setData({ pickerYear, pickerMonth })
    this.generateCalendar(pickerYear, pickerMonth)
  },
  
  nextMonth() {
    let { pickerYear, pickerMonth } = this.data
    if (pickerMonth === 12) {
      pickerMonth = 1
      pickerYear++
    } else {
      pickerMonth++
    }
    this.setData({ pickerYear, pickerMonth })
    this.generateCalendar(pickerYear, pickerMonth)
  },
  
  selectDate(e) {
    const date = e.currentTarget.dataset.date
    this.setData({ selectedDate: date })
    this.generateCalendar(this.data.pickerYear, this.data.pickerMonth)
  },
  
  selectTime(e) {
    const time = e.currentTarget.dataset.time
    this.setData({ selectedTime: time })
  },
  
  confirmDateTime() {
    const { selectedDate, selectedTime } = this.data
    
    if (!selectedDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }
    if (!selectedTime) {
      wx.showToast({ title: '请选择时间段', icon: 'none' })
      return
    }
    
    const value = `${selectedDate} ${selectedTime}`
    const field = this.data.type === 'express' ? 'deadline' : 'time'
    
    this.setData({
      [`form.${field}`]: value,
      showDateTimePicker: false
    })
  },

  onPartnerTypeChange(e) {
    const index = e.detail.value
    this.setData({
      partnerTypeIndex: index,
      'form.partnerType': this.data.partnerTypes[index].value
    })
  },

  async submit() {
    if (!requireLogin()) return

    const { type, form } = this.data
    let isValid = true
    let errorMsg = ''

    if (type === 'carpool') {
      if (!form.from.trim()) {
        errorMsg = '请输入出发地'
        isValid = false
      } else if (!form.to.trim()) {
        errorMsg = '请输入目的地'
        isValid = false
      } else if (!form.time.trim()) {
        errorMsg = '请选择出发时间'
        isValid = false
      } else if (!form.people.trim()) {
        errorMsg = '请输入人数'
        isValid = false
      } else if (!form.contact.trim()) {
        errorMsg = '请输入联系方式'
        isValid = false
      }
    } else if (type === 'express') {
      if (!form.pickupLocation.trim()) {
        errorMsg = '请输入取件地点'
        isValid = false
      } else if (!form.pickupCode.trim()) {
        errorMsg = '请输入取件码'
        isValid = false
      } else if (!form.recipient.trim()) {
        errorMsg = '请输入收件人'
        isValid = false
      } else if (!form.address.trim()) {
        errorMsg = '请输入收件地址'
        isValid = false
      } else if (!form.reward.trim()) {
        errorMsg = '请输入酬金'
        isValid = false
      } else if (!form.deadline.trim()) {
        errorMsg = '请选择截止时间'
        isValid = false
      } else if (!form.contact.trim()) {
        errorMsg = '请输入联系方式'
        isValid = false
      }
    } else if (type === 'partner') {
      if (!form.partnerType) {
        errorMsg = '请选择搭子类型'
        isValid = false
      } else if (!form.time.trim()) {
        errorMsg = '请选择时间'
        isValid = false
      } else if (!form.location.trim()) {
        errorMsg = '请输入地点'
        isValid = false
      } else if (!form.people.trim()) {
        errorMsg = '请输入需要人数'
        isValid = false
      } else if (!form.contact.trim()) {
        errorMsg = '请输入联系方式'
        isValid = false
      }
    } else if (type === 'other') {
      if (!form.title.trim()) {
        errorMsg = '请输入标题'
        isValid = false
      } else if (!form.time.trim()) {
        errorMsg = '请选择时间'
        isValid = false
      } else if (!form.location.trim()) {
        errorMsg = '请输入地点'
        isValid = false
      } else if (!form.reward.trim()) {
        errorMsg = '请输入酬金'
        isValid = false
      } else if (!form.contact.trim()) {
        errorMsg = '请输入联系方式'
        isValid = false
      }
    }

    if (!isValid) {
      showToast(errorMsg)
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
        acceptorOpenid,
        acceptorStuId,
        acceptTime,
        payTime,
        payOrderNo,
        payClaimTime,
        ...cleanForm
      } = form

      const data = { ...cleanForm, type }

      if (type === 'express' || type === 'other') {
        data.reward = parseFloat(data.reward)
        // 新增时初始化为待接单；编辑时保留服务端状态
        if (!this.data.id) {
          data.status = 'pending'
        }
      } else {
        data.people = parseInt(data.people)
      }

      if (this.data.id) {
        data.id = this.data.id
      }

      const { result } = await wx.cloud.callFunction({
        name: 'help',
        data: {
          action: this.data.id ? 'update' : 'add',
          data
        }
      })

      if (result.code === 0) {
        if ((data.type === 'express' || data.type === 'other') && !this.data.id) {
          // 新发布的付费互助：需先支付才能被接单
          this.requestSubscribeMessage()
          const { confirm } = await wx.showModal({
            title: '发布成功',
            content: '需先支付后才可被接单，是否立即支付？',
            confirmText: '去支付',
            cancelText: '稍后'
          })
          if (confirm) {
            wx.redirectTo({ url: `/pages/help/detail?type=${data.type}&id=${result.data}` })
          } else {
            navigateBack()
          }
        } else {
          showToast(this.data.id ? '修改成功' : '发布成功', 'success')
          setTimeout(() => {
            navigateBack()
          }, 1500)
        }
      } else {
        showToast(result.msg || (this.data.id ? '修改失败' : '发布失败'))
      }
    } catch (error) {
      console.error('提交失败:', error)
      showToast('提交失败')
    } finally {
      hideLoading()
    }
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

  async requestSubscribeMessage() {
    const templates = await this.getTemplateIds()
    const tmplIds = Object.values(templates).filter(id => id)
    if (tmplIds.length === 0) return
    
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        console.log('订阅消息授权结果:', res)
      },
      fail: (err) => {
        console.log('订阅消息授权失败:', err)
      }
    })
  }
})
