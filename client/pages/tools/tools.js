const { navigateTo } = require('../../utils/util.js')

Page({
  data: {},
  goToMap() {
    navigateTo('/pages/tools/map')
  },

  goToTrainingPlan() {
    navigateTo('/pages/tools/trainingPlan')
  }
})
