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
    navigateTo('/pages/tools/trainingPlan')
  },

  goToTransfer() {
    navigateTo('/pages/tools/docs?type=transfer')
  }
})
