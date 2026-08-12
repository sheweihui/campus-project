// 文档资料云函数：转专业 / 培养方案等官方文档列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

async function getAll(query) {
  const MAX = 100
  const list = []
  let skip = 0
  while (true) {
    const res = await query.skip(skip).limit(MAX).get()
    list.push(...res.data)
    if (res.data.length < MAX) break
    skip += MAX
  }
  return list
}

async function isAdmin(openid) {
  if (!openid) return false
  try {
    const doc = await db.collection('config').doc('admin').get()
    const list = doc.data && doc.data.openidList
    return Array.isArray(list) && list.includes(openid)
  } catch (e) {
    return false
  }
}

exports.main = async (event, context) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()

  try {
    if (action === 'list') {
      const where = {}
      if (data.type) where.type = data.type
      const list = await getAll(
        db.collection('documents').where(where).orderBy('category', 'asc').orderBy('title', 'asc')
      )
      return { code: 0, data: list }
    }

    if (action === 'saveAll') {
      // 仅管理员：按 type 整表替换（用于控制台导入后的校正/重复导入）
      if (!(await isAdmin(OPENID))) {
        return { code: -1, msg: '无权限' }
      }
      const docs = Array.isArray(data.list) ? data.list : []
      if (docs.length === 0) {
        return { code: -1, msg: '列表为空' }
      }
      const type = docs[0].type || ''
      // 删除该类型旧数据
      let deleted = 0
      while (true) {
        const res = await db.collection('documents').where({ type }).limit(100).remove()
        deleted += res.stats.removed || 0
        if (!res.stats.removed) break
      }
      // 批量插入
      for (let i = 0; i < docs.length; i += 100) {
        const batch = docs.slice(i, i + 100)
        await Promise.all(batch.map(d =>
          db.collection('documents').add({ data: { ...d, createTime: db.serverDate() } })
        ))
      }
      return { code: 0, msg: `导入完成：${docs.length} 条` }
    }

    return { code: -1, msg: '未知操作' }
  } catch (error) {
    console.error('docs 云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}
