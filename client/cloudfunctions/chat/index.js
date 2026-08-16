const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'send':
        return await sendMessage(data, OPENID)
      case 'list':
        return await listMessages(data, OPENID)
      case 'getBuyerList':
        return await getBuyerList(data, OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function sendMessage(data, openid) {
  const { senderId, receiverId, content, relatedId, relatedType } = data

  // 发送者必须是调用者本人，防止冒充他人发消息
  if (!senderId || senderId !== openid) {
    return { code: -1, msg: '无权限发送消息' }
  }
  if (!receiverId || !content) {
    return { code: -1, msg: '参数不完整' }
  }
  if (String(content).length > 500) {
    return { code: -1, msg: '消息内容最多 500 字' }
  }

  const result = await db.collection('chats').add({
    data: {
      senderId,
      receiverId,
      content,
      relatedId,
      relatedType,
      isRead: false,
      createTime: db.serverDate()
    }
  })

  // 发送消息通知
  await sendMessageNotification(senderId, receiverId, content, relatedType, relatedId)

  return { code: 0, data: result._id }
}

async function sendMessageNotification(senderId, receiverId, content, relatedType, relatedId) {
  try {
    // 获取发送者信息
    const senderRes = await db.collection('users').where({ openid: senderId }).get()
    const senderName = senderRes.data.length > 0 ? (senderRes.data[0].name || senderRes.data[0].nickName || '用户') : '用户'

    // 判断消息类型
    let title = '新消息'
    if (relatedType && relatedType.includes('market')) {
      title = '二手市场消息'
    } else if (relatedType && relatedType.includes('help')) {
      title = '互助消息'
    } else if (relatedType && relatedType.includes('lostfound')) {
      title = '失物招领消息'
    }

    // 创建通知消息（使用 openid 关联）
    await db.collection('messages').add({
      data: {
        toOpenid: receiverId,
        type: 'user',
        title,
        content: `${senderName}: ${content}`,
        isRead: false,
        relatedId: relatedId || '',
        relatedType: relatedType || '',
        createTime: db.serverDate()
      }
    })
  } catch (error) {
    console.error('发送消息通知失败:', error)
  }
}

async function listMessages(data, openid) {
  const { myOpenid, otherOpenid, relatedId } = data

  // 只能查看自己参与的会话
  if (!myOpenid || myOpenid !== openid) {
    return { code: -1, msg: '无权限查看' }
  }

  const result = await db.collection('chats')
    .where(_.or([
      {
        senderId: openid,
        receiverId: otherOpenid,
        relatedId
      },
      {
        senderId: otherOpenid,
        receiverId: openid,
        relatedId
      }
    ]))
    .orderBy('createTime', 'asc')
    .get()

  // 标记已读
  await db.collection('chats')
    .where({
      senderId: otherOpenid,
      receiverId: openid,
      relatedId,
      isRead: false
    })
    .update({
      data: { isRead: true }
    })

  return { code: 0, data: result.data }
}

async function getBuyerList(data, openid) {
  const { relatedId, sellerOpenid } = data

  // 卖家必须是调用者本人，防止查看他人的买家列表
  if (!sellerOpenid || sellerOpenid !== openid) {
    return { code: -1, msg: '无权限查看' }
  }

  // 获取所有与该商品相关的消息
  const messages = await getAll(db.collection('chats').where({ relatedId }).orderBy('createTime', 'desc'))

  // 提取所有买家（发送者不是卖家的人）
  const buyerMap = {}
  messages.data.forEach(msg => {
    if (msg.senderId !== sellerOpenid && !buyerMap[msg.senderId]) {
      buyerMap[msg.senderId] = {
        openid: msg.senderId,
        lastMsg: msg.content,
        lastTime: formatTime(msg.createTime)
      }
    }
  })

  // 获取买家信息
  const buyerList = Object.values(buyerMap)
  for (let buyer of buyerList) {
    const userRes = await db.collection('users').where({ openid: buyer.openid }).get()
    if (userRes.data.length > 0) {
      buyer.nickName = userRes.data[0].name || userRes.data[0].nickName || '用户'
      buyer.phoneMask = userRes.data[0].phone
        ? `${userRes.data[0].phone.slice(0, 3)}****${userRes.data[0].phone.slice(-4)}`
        : ''
    } else {
      buyer.nickName = '用户'
    }
  }

  return { code: 0, data: buyerList }
}

// 分批拉取全部数据，绕开单次 100 条上限
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
  return { data: list }
}

function formatTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    return `${date.getMonth() + 1}-${date.getDate()}`
  }
}
