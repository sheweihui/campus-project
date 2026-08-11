// 临时查询云函数：查找商品中与“高数/高等数学/微积分/数学”相关的记录
// 使用完可删除整个 queryMarket 文件夹
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const reg = db.RegExp({ regexp: '高数|高等数学|微积分|数学', options: 'i' })
  const where = _.or([
    { title: reg },
    { description: reg }
  ])

  // 分批拉取全部匹配记录
  const list = []
  let skip = 0
  while (true) {
    const res = await db.collection('market')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(100)
      .get()
    list.push(...res.data)
    if (res.data.length < 100) break
    skip += 100
  }

  return {
    code: 0,
    total: list.length,
    data: list.map(item => ({
      id: item._id,
      title: item.title,
      price: item.price,
      originalPrice: item.originalPrice,
      condition: item.condition,
      status: item.status,
      category: item.category,
      description: (item.description || '').slice(0, 120),
      imageCount: (item.images || []).length,
      createTime: item.createTime
    }))
  }
}
