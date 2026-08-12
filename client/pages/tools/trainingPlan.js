const { showLoading, hideLoading } = require('../../../utils/util.js')

// 示例数据：云数据库 config 集合 trainingPlan 文档配置后会自动替换
const SAMPLE_PLAN = {
  major: '示例专业（软件工程）',
  totalCredits: 160,
  semesters: [
    {
      name: '大一上',
      courses: [
        { name: '高等数学（一）', type: '必修', credit: 5, hours: 80 },
        { name: '线性代数', type: '必修', credit: 3, hours: 48 },
        { name: '程序设计基础（C语言）', type: '必修', credit: 4, hours: 64 },
        { name: '大学英语（一）', type: '必修', credit: 3, hours: 48 },
        { name: '思想道德与法治', type: '必修', credit: 3, hours: 48 },
        { name: '体育（一）', type: '必修', credit: 1, hours: 32 }
      ]
    },
    {
      name: '大一下',
      courses: [
        { name: '高等数学（二）', type: '必修', credit: 5, hours: 80 },
        { name: '离散数学', type: '必修', credit: 3, hours: 48 },
        { name: '面向对象程序设计（C++）', type: '必修', credit: 4, hours: 64 },
        { name: '大学英语（二）', type: '必修', credit: 3, hours: 48 },
        { name: '大学物理（一）', type: '必修', credit: 4, hours: 64 },
        { name: '体育（二）', type: '必修', credit: 1, hours: 32 }
      ]
    },
    {
      name: '大二上',
      courses: [
        { name: '数据结构', type: '必修', credit: 4, hours: 64 },
        { name: '数字逻辑', type: '必修', credit: 3, hours: 48 },
        { name: '概率论与数理统计', type: '必修', credit: 3, hours: 48 },
        { name: 'Java 程序设计', type: '必修', credit: 3, hours: 48 },
        { name: '马克思主义基本原理', type: '必修', credit: 3, hours: 48 }
      ]
    },
    {
      name: '大二下',
      courses: [
        { name: '算法设计与分析', type: '必修', credit: 3, hours: 48 },
        { name: '计算机组成原理', type: '必修', credit: 4, hours: 64 },
        { name: '操作系统', type: '必修', credit: 4, hours: 64 },
        { name: '数据库原理', type: '必修', credit: 3, hours: 48 },
        { name: '计算机网络', type: '必修', credit: 3, hours: 48 }
      ]
    },
    {
      name: '大三上',
      courses: [
        { name: '软件工程', type: '必修', credit: 3, hours: 48 },
        { name: '编译原理', type: '必修', credit: 3, hours: 48 },
        { name: 'Web 前端开发', type: '选修', credit: 2, hours: 32 },
        { name: '移动应用开发', type: '选修', credit: 2, hours: 32 },
        { name: '人工智能导论', type: '选修', credit: 2, hours: 32 }
      ]
    },
    {
      name: '大三下',
      courses: [
        { name: '软件测试', type: '必修', credit: 2, hours: 32 },
        { name: '云计算与大数据', type: '选修', credit: 2, hours: 32 },
        { name: 'Linux 应用开发', type: '选修', credit: 2, hours: 32 },
        { name: '专业综合实践', type: '必修', credit: 3, hours: 48 }
      ]
    },
    {
      name: '大四上',
      courses: [
        { name: '企业实习', type: '必修', credit: 4, hours: 64 },
        { name: '毕业设计（开题）', type: '必修', credit: 2, hours: 32 }
      ]
    },
    {
      name: '大四下',
      courses: [
        { name: '毕业设计（论文）', type: '必修', credit: 10, hours: 160 }
      ]
    }
  ]
}

Page({
  data: {
    plan: null,
    semesters: [],
    activeIndex: 0,
    currentSemester: null,
    isSample: false
  },

  onLoad() {
    this.loadPlan()
  },

  async loadPlan() {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: { action: 'getTrainingPlan' }
      })
      const plan = (result && result.code === 0 && result.data) ? result.data : SAMPLE_PLAN
      const isSample = !(result && result.code === 0 && result.data)
      const semesters = (plan.semesters || []).map(s => {
        const credits = (s.courses || []).reduce((sum, c) => sum + (c.credit || 0), 0)
        const hours = (s.courses || []).reduce((sum, c) => sum + (c.hours || 0), 0)
        return { ...s, credits, hours, count: (s.courses || []).length }
      })
      this.setData({
        plan,
        semesters,
        activeIndex: 0,
        currentSemester: semesters[0] || null,
        isSample
      })
    } catch (error) {
      console.error('加载培养方案失败:', error)
      this.setData({ plan: SAMPLE_PLAN, isSample: true })
    } finally {
      hideLoading()
    }
  },

  switchSemester(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      activeIndex: index,
      currentSemester: this.data.semesters[index] || null
    })
  }
})
