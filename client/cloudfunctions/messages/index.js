const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'markAllRead':
        return await markAllRead(data, OPENID)
      case 'markRead':
        return await markRead(data, OPENID)
      case 'getUnreadCount':
        return await getUnreadCount(data, OPENID)
      case 'list':
        return await listMessages(data, OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

// 校验 openid 是否为调用者本人，防止越权读写他人消息
function checkAccess(paramOpenid, myOpenid) {
  return Boolean(myOpenid) && paramOpenid === myOpenid
}

async function markAllRead(data, myOpenid) {
  const { openid } = data
  if (!checkAccess(openid, myOpenid)) {
    return { code: -1, msg: '无权限操作' }
  }

  // 分批取完所有未读消息（单次 get 上限 100 条）
  let total = 0
  while (true) {
    const messages = await db.collection('messages')
      .where({ toOpenid: openid, isRead: false })
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

async function markRead(data, myOpenid) {
  const { openid, messageId } = data
  if (!checkAccess(openid, myOpenid)) {
    return { code: -1, msg: '无权限操作' }
  }
  if (!messageId) {
    return { code: -1, msg: '参数不完整' }
  }

  try {
    const msg = await db.collection('messages').doc(messageId).get()
    if (!msg.data) {
      return { code: -1, msg: '消息不存在' }
    }
    // 只能标记发给自己的消息
    if (msg.data.toOpenid !== openid) {
      return { code: -1, msg: '无权限操作' }
    }
    await db.collection('messages').doc(messageId).update({
      data: { isRead: true }
    })
    return { code: 0, msg: '已读' }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function getUnreadCount(data, myOpenid) {
  const { openid } = data
  if (!checkAccess(openid, myOpenid)) {
    return { code: -1, msg: '无权限操作' }
  }

  const result = await db.collection('messages')
    .where({ toOpenid: openid, isRead: false })
    .count()

  return { code: 0, data: { count: result.total } }
}

async function listMessages(data, myOpenid) {
  const { openid, tab, page = 1, pageSize = 10 } = data
  if (!checkAccess(openid, myOpenid)) {
    return { code: -1, msg: '无权限操作' }
  }

  const where = { toOpenid: openid }

  if (tab === 'unread') {
    where.isRead = false
  } else if (tab === 'read') {
    where.isRead = true
  }

  const result = await db.collection('messages')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return { code: 0, data: { list: result.data } }
}
