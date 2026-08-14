const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

Page({
  data: {
    type: '',
    title: '文档资料',
    keyword: '',
    groups: [],
    loading: true
  },

  onLoad(options) {
    const type = options.type || 'transfer'
    const titles = {
      transfer: '转专业资料',
      training: '培养方案文档',
      baoyan: '保研+奖学金'
    }
    this.setData({ type, title: titles[type] || '文档资料' })
    wx.setNavigationBarTitle({ title: titles[type] || '文档资料' })
    this.loadDocs(type)
  },

  onUnload() {
    clearTimeout(this._searchTimer)
  },

  async loadDocs(type) {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'docs',
        data: { action: 'list', data: { type, keyword: this.data.keyword } }
      })
      if (result.code === 0) {
        const groups = []
        const map = {}
        result.data.forEach(item => {
          if (!map[item.category]) {
            map[item.category] = { category: item.category, items: [] }
            groups.push(map[item.category])
          }
          map[item.category].items.push(item)
        })
        this.setData({ groups, loading: false })
      } else {
        showToast(result.msg || '加载失败')
        this.setData({ loading: false })
      }
    } catch (error) {
      console.error('加载文档失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    } finally {
      hideLoading()
    }
  },

  // 关键字搜索：输入防抖 300ms 后触发
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.loadDocs(this.data.type)
    }, 300)
  },

  // 键盘「搜索」键触发
  onSearchConfirm() {
    clearTimeout(this._searchTimer)
    this.loadDocs(this.data.type)
  },

  // 清空关键字
  clearSearch() {
    this.setData({ keyword: '' })
    this.loadDocs(this.data.type)
  },

  // 打开文档：下载后调用 wx.openDocument
  openDoc(e) {
    const item = e.currentTarget.dataset.item
    if (!item || (!item.url && !item.fileID)) {
      showToast('文档地址缺失')
      return
    }

    const fileName = item.fileName || item.title || ''
    const ext = fileName.split('.').pop().toLowerCase()
    const fileType = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext) ? ext : 'pdf'

    showLoading('下载文档...')
    const doOpen = (url) => {
      wx.downloadFile({
        url,
        success: (res) => {
          hideLoading()
          if (res.statusCode !== 200) {
            showToast('下载失败')
            return
          }
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType,
            showMenu: true,
            fail: (err) => {
              console.error('打开文档失败:', err)
              showToast('打开失败')
            }
          })
        },
        fail: (err) => {
          hideLoading()
          console.error('下载失败:', err)
          showToast('下载失败，请检查域名配置')
        }
      })
    }

    if (item.fileID) {
      wx.cloud.callFunction({
        name: 'docs',
        data: { action: 'getUrl', data: { fileID: item.fileID } }
      }).then(res => {
        const result = res && res.result
        if (result && result.code === 0 && result.data && result.data.url) {
          doOpen(result.data.url)
        } else {
          hideLoading()
          showToast((result && result.msg) || '获取文件地址失败')
        }
      }).catch(err => {
        console.error('[openDoc] 获取文件地址异常:', err)
        hideLoading()
        showToast('获取文件地址失败')
      })
    } else {
      doOpen(item.url)
    }
  },

  formatSize(size) {
    if (!size) return ''
    return `${size}KB`
  }
})
