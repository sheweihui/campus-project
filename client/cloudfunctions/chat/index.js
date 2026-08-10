const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    // 通过 openid 解析调用者的学号，用于身份校验
    const myStuId = await getStuIdByOpenid(OPENID)

    switch (action) {
      case 'send':
        return await sendMessage(data, myStuId)
      case 'list':
        return await listMessages(data, myStuId)
      case 'getBuyerList':
        return await getBuyerList(data, myStuId)
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

async function sendMessage(data, myStuId) {
  const { senderId, receiverId, content, relatedId, relatedType } = data

  // 发送者必须是调用者本人，防止冒充他人发消息
  if (!senderId || senderId !== myStuId) {
    return { code: -1, msg: '无权限发送消息' }
  }
  if (!receiverId || !content) {
    return { code: -1, msg: '参数不完整' }
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

  // 发送消息通知（传递relatedId用于跳转）
  await sendMessageNotification(senderId, receiverId, content, relatedType, relatedId)

  return { code: 0, data: result._id }
}

async function sendMessageNotification(senderId, receiverId, content, relatedType, relatedId) {
  try {
    // 获取发送者信息
    const senderRes = await db.collection('student').where({ stuId: senderId }).get()
    const senderName = senderRes.data.length > 0 ? senderRes.data[0].name : senderId

    // 获取接收者信息
    const receiverRes = await db.collection('student').where({ stuId: receiverId }).get()
    if (receiverRes.data.length === 0) {
      return // 接收者不存在，不发送通知
    }

    // 判断消息类型
    let title = '新消息'
    let messageContent = `${senderName}: ${content}`

    if (relatedType?.includes('market')) {
      title = '二手市场消息'
    } else if (relatedType?.includes('help')) {
      title = '互助消息'
    } else if (relatedType?.includes('lostfound')) {
      title = '失物招领消息'
    }

    // 创建通知消息（使用学号关联，添加跳转信息）
    await db.collection('messages').add({
      data: {
        toStuId: receiverId,  // 用学号代替 openid
        type: 'user',
        title,
        content: messageContent,
        isRead: false,
        relatedId: relatedId || '',  // 关联的记录ID，用于跳转
        relatedType: relatedType || '',  // 关联的类型，用于跳转
        createTime: db.serverDate()
      }
    })
  } catch (error) {
    console.error('发送消息通知失败:', error)
  }
}

async function listMessages(data, myStuId) {
  const { myStuId: paramMyStuId, otherStuId, relatedId } = data

  // 只能查看自己参与的会话
  if (!myStuId || paramMyStuId !== myStuId) {
    return { code: -1, msg: '无权限查看' }
  }

  const result = await db.collection('chats')
    .where(_.or([
      {
        senderId: myStuId,
        receiverId: otherStuId,
        relatedId
      },
      {
        senderId: otherStuId,
        receiverId: myStuId,
        relatedId
      }
    ]))
    .orderBy('createTime', 'asc')
    .get()

  // 标记已读
  await db.collection('chats')
    .where({
      senderId: otherStuId,
      receiverId: myStuId,
      relatedId,
      isRead: false
    })
    .update({
      data: { isRead: true }
    })

  return { code: 0, data: result.data }
}

async function getBuyerList(data, myStuId) {
  const { relatedId, sellerStuId } = data

  // 卖家必须是调用者本人，防止查看他人的买家列表
  if (!myStuId || sellerStuId !== myStuId) {
    return { code: -1, msg: '无权限查看' }
  }

  // 获取所有与该商品相关的消息
  const messages = await getAll(db.collection('chats').where({ relatedId }).orderBy('createTime', 'desc'))

  // 提取所有买家（发送者不是卖家的人）
  const buyerMap = {}
  messages.data.forEach(msg => {
    if (msg.senderId !== sellerStuId && !buyerMap[msg.senderId]) {
      buyerMap[msg.senderId] = {
        stuId: msg.senderId,
        lastMsg: msg.content,
        lastTime: formatTime(msg.createTime)
      }
    }
  })

  // 获取买家信息
  const buyerList = Object.values(buyerMap)
  for (let buyer of buyerList) {
    const userRes = await db.collection('student').where({ stuId: buyer.stuId }).get()
    if (userRes.data.length > 0) {
      buyer.name = userRes.data[0].name || ''
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
