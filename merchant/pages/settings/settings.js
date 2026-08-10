const { showToast, showLoading, hideLoading } = require('../../utils/util.js')

Page({
  data: {
    // 提现设置
    minWithdrawAmount: 10,
    commissionRate: 15,

    // 管理员信息
    adminInfo: {
      version: '1.0.0',
      envId: 'cloudbase-d6gny18wlbad9e070'
    },

    // 快捷入口
    shortcuts: [
      { icon: '📋', label: '订单管理', url: '/pages/orders/orders', type: 'tab' },
      { icon: '💰', label: '提现管理', url: '/pages/withdraws/withdraws', type: 'page' },
      { icon: '👥', label: '用户管理', url: '/pages/users/users', type: 'page' },
      { icon: '💳', label: '财务总览', url: '/pages/finance/finance', type: 'tab' }
    ]
  },

  // 快捷入口跳转
  goToPage(e) {
    const item = e.currentTarget.dataset.item
    if (item.type === 'tab') {
      wx.switchTab({ url: item.url })
    } else {
      wx.navigateTo({ url: item.url })
    }
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync()
          showToast('缓存已清除', 'success')
        }
      }
    })
  }
})
