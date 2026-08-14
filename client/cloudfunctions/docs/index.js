// 文档资料云函数：转专业 / 培养方案等官方文档列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// type -> 集合名：培养方案与转专业分集合存储
const COLLECTIONS = {
  training: 'trainingDocs',       // 培养方案
  transfer: 'transferDocs',       // 转专业
  baoyan: 'baoyanDocs',           // 保研
  scholarship: 'scholarshipDocs'  // 奖学金
}

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

// 转义正则特殊字符，让关键字按字面匹配
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
      const { type, keyword } = data
      const collection = COLLECTIONS[type]
      if (!collection) {
        return { code: -1, msg: '无效的文档类型' }
      }

      let where = {}
      const kw = (keyword || '').trim()
      if (kw) {
        const reg = db.RegExp({ regexp: escapeRegExp(kw), options: 'i' })
        where = _.or([
          { title: reg },
          { fileName: reg },
          { category: reg }
        ])
      }

      const list = await getAll(
        db.collection(collection).where(where).orderBy('category', 'asc').orderBy('title', 'asc')
      )
      return { code: 0, data: list }
    }

    if (action === 'saveAll') {
      // 仅管理员：按 type 整集合替换（用于控制台导入后的校正/重复导入）
      if (!(await isAdmin(OPENID))) {
        return { code: -1, msg: '无权限' }
      }
      const docs = Array.isArray(data.list) ? data.list : []
      if (docs.length === 0) {
        return { code: -1, msg: '列表为空' }
      }
      const type = docs[0].type || ''
      const collection = COLLECTIONS[type]
      if (!collection) {
        return { code: -1, msg: '无效的文档类型' }
      }
      // 删除该集合旧数据
      let deleted = 0
      while (true) {
        const res = await db.collection(collection).limit(100).remove()
        deleted += res.stats.removed || 0
        if (!res.stats.removed) break
      }
      // 批量插入（去掉冗余 type 字段，集合本身已区分类型）
      for (let i = 0; i < docs.length; i += 100) {
        const batch = docs.slice(i, i + 100)
        await Promise.all(batch.map(d => {
          const { type: _t, ...rest } = d
          return db.collection(collection).add({ data: { ...rest, createTime: db.serverDate() } })
        }))
      }
      return { code: 0, msg: `导入完成：${docs.length} 条` }
    }

    if (action === 'getUrl') {
      // 服务端换取临时链接：云函数以管理员身份运行，可绕过文件的“仅管理员可读写”限制
      const { fileID } = data
      if (!fileID) {
        return { code: -1, msg: '缺少 fileID' }
      }
      const res = await cloud.getTempFileURL({ fileList: [fileID] })
      const file = res.fileList && res.fileList[0]
      if (file && file.tempFileURL) {
        return { code: 0, data: { url: file.tempFileURL } }
      }
      return { code: -1, msg: (file && file.errMsg) || '获取文件地址失败' }
    }

    return { code: -1, msg: '未知操作' }
  } catch (error) {
    console.error('docs 云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}
