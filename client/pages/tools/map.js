const { showToast } = require('../../utils/util.js')

Page({
  data: {
    keyword: '',
    currentCategory: 'all',
    locationList: [],
    mapImageUrl: '/tabbar/地图.jpg',
    allLocations: [
      { name: '教学楼(J)', address: '东区二期', icon: '🏫', category: 'teaching' },
      { name: '艺术楼(Y)', address: '东区二期', icon: '🎨', category: 'teaching' },
      { name: '图书馆(T)', address: '东区二期', icon: '📚', category: 'library' },
      { name: '软件楼(A)', address: '西区一期', icon: '💻', category: 'teaching' },
      { name: '文体中心', address: '东区二期', icon: '🏛️', category: 'sports' },
      { name: '体育场', address: '东区二期', icon: '⚽', category: 'sports' },
      { name: '篮球场', address: '东区二期', icon: '🏀', category: 'sports' },
      { name: '食堂营业厅', address: '东区二期', icon: '🍜', category: 'canteen' },
      { name: '13公寓食堂', address: '西区一期', icon: '🍝', category: 'canteen' },
      { name: '10公寓食堂', address: '西区一期', icon: '🍲', category: 'canteen' },
      { name: '11公寓食堂', address: '西区一期', icon: '🥘', category: 'canteen' },
      { name: '12公寓食堂', address: '西区一期', icon: '🍱', category: 'canteen' },
      { name: '3公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '4公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '5公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '6公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '7公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '8公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '9公寓楼', address: '东区二期', icon: '🏢', category: 'dormitory' },
      { name: '10公寓楼', address: '西区一期', icon: '🏢', category: 'dormitory' },
      { name: '11公寓楼', address: '西区一期', icon: '🏢', category: 'dormitory' },
      { name: '12公寓楼', address: '西区一期', icon: '🏢', category: 'dormitory' },
      { name: '13公寓楼', address: '西区一期', icon: '🏢', category: 'dormitory' },
      { name: '14公寓楼', address: '西区一期', icon: '🏢', category: 'dormitory' },
      { name: '2号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '3号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '4号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '5号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '6号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '7号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '8号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '9号楼', address: '西区一期广场', icon: '🏛️', category: 'teaching' },
      { name: '大学生创业楼', address: '西区一期广场', icon: '🚀', category: 'teaching' }
    ]
  },

  onLoad() {
    // 初始化时即展示全部地点，避免列表为空
    this.filterLocations()
  },

  previewMap() {
    // 代码包内图片不能直接预览，先转成临时路径
    wx.getImageInfo({
      src: this.data.mapImageUrl,
      success: (res) => {
        wx.previewImage({
          urls: [res.path],
          current: res.path
        })
      },
      fail: () => {
        showToast('预览失败')
      }
    })
  },

  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    })
    this.filterLocations()
  },

  onSearch() {
    this.filterLocations()
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      currentCategory: category
    })
    this.filterLocations()
  },

  filterLocations() {
    let list = this.data.allLocations

    if (this.data.currentCategory !== 'all') {
      list = list.filter(item => item.category === this.data.currentCategory)
    }

    if (this.data.keyword) {
      const keyword = this.data.keyword.toLowerCase()
      list = list.filter(item => 
        item.name.toLowerCase().includes(keyword) || 
        item.address.toLowerCase().includes(keyword)
      )
    }

    this.setData({
      locationList: list
    })
  },

  selectLocation(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: item.name,
      content: `地址：${item.address}`,
      showCancel: false
    })
  }
})
