Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: 'onVisibleChange'
    },
    value: {
      type: String,
      value: ''
    }
  },

  data: {
    currentTab: 'date',
    currentYear: 2026,
    currentMonth: 6,
    selectedDate: '',
    selectedTime: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    timeSlots: []
  },

  lifetimes: {
    attached() {
      this.initTimeSlots()
      this.generateCalendar()
      if (this.properties.value) {
        this.parseValue(this.properties.value)
      }
    }
  },

  methods: {
    onVisibleChange(val) {
      if (val) {
        const now = new Date()
        this.setData({
          currentYear: now.getFullYear(),
          currentMonth: now.getMonth() + 1
        })
        this.generateCalendar()
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

    generateCalendar() {
      const { currentYear, currentMonth } = this.data
      const days = []
      
      const firstDay = new Date(currentYear, currentMonth - 1, 1)
      const lastDay = new Date(currentYear, currentMonth, 0)
      const today = new Date()
      
      const startDay = firstDay.getDay()
      const totalDays = lastDay.getDate()
      
      const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate()
      for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i
        const date = new Date(currentYear, currentMonth - 2, day)
        days.push({
          day,
          date: this.formatDate(date),
          type: 'prev'
        })
      }
      
      for (let i = 1; i <= totalDays; i++) {
        const date = new Date(currentYear, currentMonth - 1, i)
        const isToday = today.getFullYear() === currentYear && 
                        today.getMonth() + 1 === currentMonth && 
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
        const date = new Date(currentYear, currentMonth, i)
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

    parseValue(value) {
      if (!value) return
      const parts = value.split(' ')
      if (parts.length >= 1) {
        this.setData({ selectedDate: parts[0] })
      }
      if (parts.length >= 2) {
        this.setData({ selectedTime: parts[1] })
      }
    },

    prevMonth() {
      let { currentYear, currentMonth } = this.data
      if (currentMonth === 1) {
        currentMonth = 12
        currentYear--
      } else {
        currentMonth--
      }
      this.setData({ currentYear, currentMonth })
      this.generateCalendar()
    },

    nextMonth() {
      let { currentYear, currentMonth } = this.data
      if (currentMonth === 12) {
        currentMonth = 1
        currentYear++
      } else {
        currentMonth++
      }
      this.setData({ currentYear, currentMonth })
      this.generateCalendar()
    },

    selectDate(e) {
      const date = e.currentTarget.dataset.date
      this.setData({ 
        selectedDate: date,
        calendarDays: this.data.calendarDays.map(item => ({
          ...item,
          isSelected: item.date === date
        }))
      })
    },

    selectTime(e) {
      const time = e.currentTarget.dataset.time
      this.setData({ selectedTime: time })
    },

    switchTab(tab) {
      this.setData({ currentTab: tab })
    },

    onPopupTap() {
    },

    handleOverlayClick() {
      this.triggerEvent('close')
    },

    handleClose() {
      this.triggerEvent('close')
    },

    handleConfirm() {
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
      this.triggerEvent('confirm', { value, date: selectedDate, time: selectedTime })
      this.triggerEvent('close')
    }
  }
})