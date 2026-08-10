const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'login':
        return await login(OPENID, data)
      case 'getInfo':
        return await getUserInfo(OPENID)
      case 'update':
        return await updateUser(OPENID, data)
      case 'getStats':
        return await getUserStats(OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function login(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  
  if (user.data.length === 0) {
    // 新用户，创建记录
    await db.collection('users').add({
      data: {
        openid,
        ...data,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    // 更新登录信息
    await db.collection('users').doc(user.data[0]._id).update({
      data: {
        ...data,
        updateTime: db.serverDate()
      }
    })
  }
  
  return { code: 0, msg: '登录成功' }
}

async function getUserInfo(openid) {
  const user = await db.collection('users').where({ openid }).get()
  
  if (user.data.length === 0) {
    return { code: -1, msg: '用户不存在' }
  }
  
  return { code: 0, data: user.data[0] }
}

async function updateUser(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  
  if (user.data.length === 0) {
    return { code: -1, msg: '用户不存在' }
  }
  
  await db.collection('users').doc(user.data[0]._id).update({
    data: {
      ...data,
      updateTime: db.serverDate()
    }
  })
  
  return { code: 0, msg: '更新成功' }
}

async function getUserStats(openid) {
  // 获取各模块发布数量，添加容错处理
  const lostfoundCount = await safeCount(db.collection('lostfound').where({ openid }))
  const marketCount = await safeCount(db.collection('market').where({ openid }))
  const carpoolCount = await safeCount(db.collection('help-carpool').where({ openid }))
  const expressCount = await safeCount(db.collection('help-express').where({ openid }))
  const partnerCount = await safeCount(db.collection('help-partner').where({ openid }))
  
  // 获取未读消息数
  const unreadMessages = await safeCount(db.collection('messages').where({
    toOpenid: openid,
    isRead: false
  }))
  
  return {
    code: 0,
    data: {
      lostfound: lostfoundCount,
      market: marketCount,
      help: carpoolCount + expressCount + partnerCount,
      unreadMessages: unreadMessages
    }
  }
}

async function safeCount(query) {
  try {
    const result = await query.count()
    return result.total || 0
  } catch (error) {
    console.warn('Count failed:', error.message)
    return 0
  }
}