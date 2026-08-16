const { showLoading, hideLoading, showToast } = require('../../../utils/util.js')

Page({
  data: {
    currentType: 'market',
    typeTabs: [
      { key: 'market', label: '二手商品' },
      { key: 'help', label: '互助信息' },
      { key: 'lostfound', label: '失物招领' }
    ],
    statusFilter: 'all',
    statusOptions: {
      market: [
        { key: 'all', label: '全部' },
        { key: 'onSale', label: '在售' },
        { key: 'paying', label: '交易中' },
        { key: 'sold', label: '已售出' },
        { key: 'off', label: '已下架' }
      ],
      help: [
        { key: 'all', label: '全部' },
        { key: 'active', label: '进行中' },
        { key: 'pending', label: '待支付' },
        { key: 'prepaid', label: '待接单' },
        { key: 'accepted', label: '已接单' },
        { key: 'completed', label: '已完成' }
      ],
      lostfound: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '进行中' },
        { key: 'completed', label: '已完成' }
      ]
    },
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loading: false,

    // 编辑弹层
    showEdit: false,
    editItem: null,
    editForm: {},
    editStatusOptions: [],
    editStatusIndex: 0,

    // 备注弹层
    showRemark: false,
    remarkItem: null,
    remarkText: ''
  },

  onLoad() {
    this.loadList()
  },

  // 弹层点击穿透拦截
  noop() {},

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(true)
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, list: [] })
    this.loadList().then(() => wx.stopPullDownRefresh())
  },

  switchType(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ currentType: key, statusFilter: 'all', keyword: '', page: 1, hasMore: true, list: [] })
    this.loadList()
  },

  switchStatus(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ statusFilter: key, page: 1, hasMore: true, list: [] })
    this.loadList()
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, hasMore: true, list: [] })
    this.loadList()
  },

  async loadList(loadMore = false) {
    if (this.data.loading) return
    this.setData({ loading: true })
    const page = loadMore ? this.data.page + 1 : 1

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'listPosts',
          data: {
            type: this.data.currentType,
            status: this.data.statusFilter,
            keyword: this.data.keyword.trim(),
            page,
            pageSize: this.data.pageSize
          }
        }
      })

      if (result.code === 0) {
        const d = result.data
        const newList = loadMore ? [...this.data.list, ...d.list] : d.list
        this.setData({
          list: newList,
          page,
          total: d.total,
          hasMore: page < d.totalPages,
          loading: false
        })
      } else {
        showToast(result.msg || '加载失败')
        this.setData({ loading: false })
      }
    } catch (error) {
      console.error('加载发布列表失败:', error)
      showToast('加载失败')
      this.setData({ loading: false })
    }
  },

  // ===== 编辑 =====
  openEdit(e) {
    const item = e.currentTarget.dataset.item
    const type = this.data.currentType
    const form = { title: item.title || '' }
    if (type === 'market') {
      form.price = item.price != null ? String(item.price) : ''
    }
    if (type === 'help' && (item.reward != null)) {
      form.reward = item.reward != null ? String(item.reward) : ''
    }
    const options = this.data.statusOptions[type] || []
    const statusIndex = Math.max(0, options.findIndex(o => o.key === item.status))

    this.setData({
      showEdit: true,
      editItem: item,
      editForm: form,
      editStatusOptions: options,
      editStatusIndex: statusIndex
    })
  },

  closeEdit() {
    this.setData({ showEdit: false, editItem: null })
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  onEditStatusChange(e) {
    this.setData({ editStatusIndex: Number(e.detail.value) })
  },

  async saveEdit() {
    const { editItem, editForm, editStatusOptions, editStatusIndex } = this.data
    if (!editItem) return

    const update = { status: editStatusOptions[editStatusIndex].key }
    if (editForm.title !== undefined) update.title = editForm.title.trim()
    if (editForm.price !== undefined) {
      const price = editForm.price.trim()
      if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0) {
        showToast('价格必须是大于0的金额，最多两位小数')
        return
      }
      update.price = Number(price)
    }
    if (editForm.reward !== undefined) {
      const reward = editForm.reward.trim()
      if (!/^\d+(\.\d{1,2})?$/.test(reward) || Number(reward) <= 0) {
        showToast('酬金必须是大于0的金额，最多两位小数')
        return
      }
      update.reward = Number(reward)
    }

    showLoading('保存中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'updatePost',
          data: {
            type: editItem.postType,
            collection: editItem.collection,
            id: editItem._id,
            update
          }
        }
      })
      if (result.code === 0) {
        showToast('修改成功', 'success')
        this.closeEdit()
        this.loadList()
      } else {
        showToast(result.msg || '修改失败')
      }
    } catch (error) {
      console.error('修改发布失败:', error)
      showToast('修改失败')
    } finally {
      hideLoading()
    }
  },

  // ===== 备注 =====
  openRemark(e) {
    const item = e.currentTarget.dataset.item
    this.setData({ showRemark: true, remarkItem: item, remarkText: item.adminRemark || '' })
  },

  closeRemark() {
    this.setData({ showRemark: false, remarkItem: null })
  },

  onRemarkInput(e) {
    this.setData({ remarkText: e.detail.value })
  },

  async saveRemark() {
    const { remarkItem, remarkText } = this.data
    if (!remarkItem) return

    showLoading('保存中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'remarkPost',
          data: {
            type: remarkItem.postType,
            collection: remarkItem.collection,
            id: remarkItem._id,
            remark: remarkText
          }
        }
      })
      if (result.code === 0) {
        showToast('备注已保存', 'success')
        this.closeRemark()
        this.loadList()
      } else {
        showToast(result.msg || '保存失败')
      }
    } catch (error) {
      console.error('保存备注失败:', error)
      showToast('保存失败')
    } finally {
      hideLoading()
    }
  },

  // ===== 删除 =====
  async deletePost(e) {
    const item = e.currentTarget.dataset.item
    const { confirm } = await wx.showModal({
      title: '确认删除',
      content: `确定删除「${item.title}」这条发布吗？删除后不可恢复。`,
      confirmColor: '#e64340'
    })
    if (!confirm) return

    showLoading('删除中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'deletePost',
          data: {
            type: item.postType,
            collection: item.collection,
            id: item._id
          }
        }
      })
      if (result.code === 0) {
        showToast('删除成功', 'success')
        this.loadList()
      } else {
        showToast(result.msg || '删除失败')
      }
    } catch (error) {
      console.error('删除发布失败:', error)
      showToast('删除失败')
    } finally {
      hideLoading()
    }
  }
})