const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    // 通过 openid 解析调用者的学号，用于身份校验
    const myStuId = await getStuIdByOpenid(OPENID)

    switch (action) {
      case 'markAllRead':
        return await markAllRead(data, myStuId)
      case 'getUnreadCount':
        return await getUnreadCount(data, myStuId)
      case 'list':
        return await listMessages(data, myStuId)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

// 通过 openid 查学号
async function getStuIdByOpenid(openid) {
  if (!openid) return ''
  try {
    const res = await db.collection('student').where({ openid }).get()
    return res.data.length > 0 ? (res.data[0].stuId || '') : ''
  } catch (e) {
    return ''
  }
}

// 校验 stuId 是否为调用者本人，防止越权读写他人消息
function checkAccess(paramStuId, myStuId) {
  return Boolean(myStuId) && paramStuId === myStuId
}

async function markAllRead(data, myStuId) {
  const { stuId } = data
  if (!checkAccess(stuId, myStuId)) {
    return { code: -1, msg: '无权限操作' }
  }

  // 分批取完所有未读消息（单次 get 上限 100 条）
  let total = 0
  while (true) {
    const messages = await db.collection('messages')
      .where({ toStuId: stuId, isRead: false })
      .skip(total)
      .limit(100)
      .get()

    if (messages.data.length === 0) break

    await Promise.all(messages.data.map(msg =>
      db.collection('messages').doc(msg._id).update({
        data: { isRead: true }
      })
    ))

    total += messages.data.length
    if (messages.data.length < 100) break
  }

  return { code: 0, msg: '标记成功', data: { count: total } }
}

async function getUnreadCount(data, myStuId) {
  const { stuId } = data
  if (!checkAccess(stuId, myStuId)) {
    return { code: -1, msg: '无权限操作' }
  }

  const result = await db.collection('messages')
    .where({ toStuId: stuId, isRead: false })
    .count()
  
  return { code: 0, data: { count: result.total } }
}

async function listMessages(data, myStuId) {
  const { stuId, tab, page = 1, pageSize = 10 } = data
  if (!checkAccess(stuId, myStuId)) {
    return { code: -1, msg: '无权限操作' }
  }

  console.log('listMessages:', { stuId, tab, page, pageSize })
  
  const where = { toStuId: stuId }
  
  if (tab === 'unread') {
    where.isRead = false
  } else if (tab === 'read') {
    where.isRead = true
  }

  console.log('查询条件:', where)
  
  const result = await db.collection('messages')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  console.log('查询结果:', result.data.length, '条')
  
  return { code: 0, data: { list: result.data } }
}
