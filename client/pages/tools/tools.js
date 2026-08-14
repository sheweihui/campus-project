const { navigateTo } = require('../../utils/util.js')

Page({
  data: {},
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },
  goToMap() {
    navigateTo('/pages/tools/map')
  },

  goToTrainingPlan() {
    // 培养方案 = 官方文档整合（按版本/专业选择文件直接查看）
    navigateTo('/pages/tools/docs?type=training')
  },

  goToBaoyan() {
    // 保研 = 免试攻读研究生相关官方通知
    navigateTo('/pages/tools/docs?type=baoyan')
  },

  goToScholarship() {
    // 奖学金 = 奖学金评定相关细则
    navigateTo('/pages/tools/docs?type=scholarship')
  }
})
