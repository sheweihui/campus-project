const { showLoading, hideLoading, showToast } = require('../../utils/util.js')

// 示例数据：云数据库 config 集合 trainingPlan 文档配置后会自动替换
const SAMPLE_PLANS = [
  {
    major: '软件工程',
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
  },
  {
    major: '计算机科学与技术',
    totalCredits: 165,
    semesters: [
      {
        name: '大一上',
        courses: [
          { name: '高等数学（一）', type: '必修', credit: 5, hours: 80 },
          { name: '计算机科学导论', type: '必修', credit: 2, hours: 32 },
          { name: '程序设计基础（Python）', type: '必修', credit: 3, hours: 48 },
          { name: '大学英语（一）', type: '必修', credit: 3, hours: 48 },
          { name: '思想道德与法治', type: '必修', credit: 3, hours: 48 }
        ]
      },
      {
        name: '大一下',
        courses: [
          { name: '高等数学（二）', type: '必修', credit: 5, hours: 80 },
          { name: '离散数学', type: '必修', credit: 3, hours: 48 },
          { name: 'C 语言程序设计', type: '必修', credit: 4, hours: 64 },
          { name: '大学英语（二）', type: '必修', credit: 3, hours: 48 },
          { name: '大学物理', type: '必修', credit: 4, hours: 64 }
        ]
      },
      {
        name: '大二上',
        courses: [
          { name: '数据结构', type: '必修', credit: 4, hours: 64 },
          { name: '计算机组成原理', type: '必修', credit: 4, hours: 64 },
          { name: '概率论与数理统计', type: '必修', credit: 3, hours: 48 },
          { name: 'Java 程序设计', type: '必修', credit: 3, hours: 48 },
          { name: '马克思主义基本原理', type: '必修', credit: 3, hours: 48 }
        ]
      },
      {
        name: '大二下',
        courses: [
          { name: '算法设计与分析', type: '必修', credit: 3, hours: 48 },
          { name: '操作系统', type: '必修', credit: 4, hours: 64 },
          { name: '数据库系统原理', type: '必修', credit: 3, hours: 48 },
          { name: '计算机网络', type: '必修', credit: 3, hours: 48 },
          { name: '汇编语言', type: '选修', credit: 2, hours: 32 }
        ]
      },
      {
        name: '大三上',
        courses: [
          { name: '编译原理', type: '必修', credit: 3, hours: 48 },
          { name: '软件工程', type: '必修', credit: 3, hours: 48 },
          { name: '人工智能', type: '选修', credit: 2, hours: 32 },
          { name: '机器学习导论', type: '选修', credit: 2, hours: 32 },
          { name: 'Web 开发技术', type: '选修', credit: 2, hours: 32 }
        ]
      },
      {
        name: '大三下',
        courses: [
          { name: '嵌入式系统', type: '选修', credit: 2, hours: 32 },
          { name: '云计算与大数据', type: '选修', credit: 2, hours: 32 },
          { name: '信息安全', type: '必修', credit: 2, hours: 32 },
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
]

Page({
  data: {
    plans: [],
    majorIndex: 0,
    semesters: [],
    activeIndex: 0,
    currentSemester: null,
    isSample: false,
    docOptions: [],
    docIndex: 0,
    docsLoading: true
  },

  onLoad() {
    this.loadPlans()
    this.loadDocs()
  },

  async loadPlans() {
    showLoading('加载中...')
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'config',
        data: { action: 'getTrainingPlan' }
      })
      let plans = []
      if (result && result.code === 0 && result.data) {
        if (Array.isArray(result.data.plans)) {
          plans = result.data.plans
        } else if (result.data.major) {
          // 兼容旧的单专业结构
          plans = [result.data]
        }
      }
      const isSample = plans.length === 0
      if (isSample) {
        plans = SAMPLE_PLANS
      }
      this.setData({ plans, isSample, majorIndex: 0 })
      this.applyMajor(0)
    } catch (error) {
      console.error('加载培养方案失败:', error)
      this.setData({ plans: SAMPLE_PLANS, isSample: true, majorIndex: 0 })
      this.applyMajor(0)
    } finally {
      hideLoading()
    }
  },

  // 加载官方培养方案文档列表
  async loadDocs() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'docs',
        data: { action: 'list', data: { type: 'training' } }
      })
      if (result.code === 0 && result.data && result.data.length > 0) {
        const docOptions = result.data.map(d => ({
          ...d,
          label: `${d.title}（${d.category}）`
        }))
        this.setData({ docOptions, docIndex: 0, docsLoading: false })
      } else {
        this.setData({ docsLoading: false })
      }
    } catch (error) {
      console.error('加载培养方案文档失败:', error)
      this.setData({ docsLoading: false })
    }
  },

  // 切换所选文档
  onDocChange(e) {
    this.setData({ docIndex: Number(e.detail.value) })
  },

  // 打开所选文档
  openSelectedDoc() {
    const item = this.data.docOptions[this.data.docIndex]
    if (!item) {
      showToast('暂无文档')
      return
    }
    this.openDoc(item)
  },

  // 下载并打开文档
  openDoc(item) {
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
      wx.cloud.getTempFileURL({ fileList: [item.fileID] }).then(res => {
        const url = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
        if (url) doOpen(url)
        else {
          hideLoading()
          showToast('获取文件地址失败')
        }
      }).catch(() => {
        hideLoading()
        showToast('获取文件地址失败')
      })
    } else {
      doOpen(item.url)
    }
  },

  // 切换专业
  onMajorChange(e) {
    const index = Number(e.detail.value)
    this.setData({ majorIndex: index })
    this.applyMajor(index)
  },

  // 切换学期
  switchSemester(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      activeIndex: index,
      currentSemester: this.data.semesters[index] || null
    })
  },

  applyMajor(index) {
    const plan = this.data.plans[index]
    if (!plan) {
      this.setData({ semesters: [], activeIndex: 0, currentSemester: null })
      return
    }
    const semesters = (plan.semesters || []).map(s => {
      const credits = (s.courses || []).reduce((sum, c) => sum + (c.credit || 0), 0)
      const hours = (s.courses || []).reduce((sum, c) => sum + (c.hours || 0), 0)
      return { ...s, credits, hours, count: (s.courses || []).length }
    })
    this.setData({
      semesters,
      activeIndex: 0,
      currentSemester: semesters[0] || null
    })
  },

})
