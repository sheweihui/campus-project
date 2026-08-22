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

  const where = { toOpenid: openid, isRead: false }
  const countRes = await db.collection('messages').where(where).count()
  if (countRes.total > 0) {
    await db.collection('messages').where(where).update({
      data: {
        isRead: true,
        readTime: db.serverDate()
      }
    })
  }

  return { code: 0, msg: '标记成功', data: { count: countRes.total } }
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
    const res = await db.collection('messages')
      .where({ _id: messageId, toOpenid: openid })
      .update({
        data: {
          isRead: true,
          readTime: db.serverDate()
        }
      })
    if (!res.stats || res.stats.updated === 0) {
      return { code: -1, msg: '消息不存在或无权限操作' }
    }
    return { code: 0, msg: '已读' }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

function normalizePage(page, pageSize) {
  return {
    page: Math.max(1, Number(page) || 1),
    pageSize: Math.min(50, Math.max(1, Number(pageSize) || 10))
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
  const { openid, tab } = data
  const { page, pageSize } = normalizePage(data.page, data.pageSize)
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
    .field({
      _id: true,
      toOpenid: true,
      fromOpenid: true,
      title: true,
      content: true,
      type: true,
      relatedId: true,
      relatedType: true,
      isRead: true,
      createTime: true,
      readTime: true
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return { code: 0, data: { list: result.data } }
}
