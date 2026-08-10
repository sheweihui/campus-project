const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'login':
        return await login(OPENID, data)
      case 'getInfo':
        return await getUserInfo(OPENID, data)
      case 'update':
        return await updateUser(OPENID, data)
      case 'getStats':
        return await getUserStats(OPENID, data)
      case 'getFinance':
        return await getFinance(OPENID, data)
      case 'updateStudent':
        return await updateStudent(OPENID, data)
      case 'getWithdrawRecords':
        return await getWithdrawRecords(OPENID, data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function login(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  // 防止客户端注入 openid 覆盖服务端身份
  const cleanData = { ...(data || {}) }
  delete cleanData.openid

  if (user.data.length === 0) {
    // 新用户，创建记录
    await db.collection('users').add({
      data: {
        openid,
        ...cleanData,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    // 更新登录信息
    await db.collection('users').doc(user.data[0]._id).update({
      data: {
        ...cleanData,
        updateTime: db.serverDate()
      }
    })
  }

  return { code: 0, msg: '登录成功', data: { openid } }
}

async function getUserInfo(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  
  if (user.data.length === 0) {
    // 用户不存在，创建记录
    await db.collection('users').add({
      data: {
        openid,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    
    const newUser = await db.collection('users').where({ openid }).get()
    return { code: 0, data: newUser.data[0] }
  }
  
  // 只能查询自己的信息，忽略客户端传入的 openid，防止越权读取他人资料
  return { code: 0, data: user.data[0] }
}

async function updateUser(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  // 防止客户端注入 openid 覆盖服务端身份
  const cleanData = { ...(data || {}) }
  delete cleanData.openid

  if (user.data.length === 0) {
    // 用户不存在，创建记录
    await db.collection('users').add({
      data: {
        openid,
        ...cleanData,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    // 更新用户信息
    await db.collection('users').doc(user.data[0]._id).update({
      data: {
        ...cleanData,
        updateTime: db.serverDate()
      }
    })
  }

  return { code: 0, msg: '更新成功' }
}

async function getUserStats(openid, data) {
  const { stuId } = data || {}

  // 归属校验：只允许查看自己的统计
  if (!(await canAccessStuId(openid, stuId))) {
    return { code: -1, msg: '无权限访问' }
  }

  let where = { openid }
  if (stuId) {
    where = { stuId }
  }
  
  const lostfoundCount = await safeCount(db.collection('lostfound').where(where))
  const marketCount = await safeCount(db.collection('market').where(where))
  const carpoolCount = await safeCount(db.collection('help-carpool').where(where))
  const expressCount = await safeCount(db.collection('help-express').where(where))
  const partnerCount = await safeCount(db.collection('help-partner').where(where))
  
  let unreadMessages = 0
  try {
    const currentStuId = stuId || (await getStuIdByOpenid(openid))
    if (currentStuId) {
      unreadMessages = await safeCount(db.collection('messages').where({
        toStuId: currentStuId,
        isRead: false
      }))
    }
  } catch (error) {
    console.error('获取未读消息数失败:', error)
  }
  
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

async function getStuIdByOpenid(openid) {
  try {
    const studentRes = await db.collection('student').where({ openid }).get()
    if (studentRes.data.length > 0) {
      return studentRes.data[0].stuId || ''
    }
  } catch (error) {
    console.error('获取学号失败:', error)
  }
  return ''
}

// 校验传入的 stuId 是否属于调用者，防止越权读取他人数据
async function canAccessStuId(openid, stuId) {
  if (!stuId) return true
  try {
    const res = await db.collection('student').where({ stuId }).get()
    if (res.data.length === 0) return false
    return res.data[0].openid === openid
  } catch (e) {
    return false
  }
}

async function getFinance(openid, data) {
  const { stuId } = data || {}

  // 归属校验：只允许查看自己的财务
  if (!(await canAccessStuId(openid, stuId))) {
    return { code: -1, msg: '无权限访问' }
  }

  const where = {}

  if (stuId) {
    where.stuId = stuId
  } else {
    where.openid = openid
  }
  
  const finance = await db.collection('finance').where(where).get()
  
  if (finance.data.length === 0) {
    return {
      code: 0,
      data: {
        totalCommission: 0,
        availableAmount: 0,
        withdrawAmount: 0,
        withdrawRecords: []
      }
    }
  }
  
  return { code: 0, data: finance.data[0] }
}

async function getWithdrawRecords(openid, data) {
  const { status, stuId } = data

  // 归属校验：只允许查看自己的提现记录
  if (!(await canAccessStuId(openid, stuId))) {
    return { code: -1, msg: '无权限访问' }
  }

  const where = {}

  if (stuId) {
    where.stuId = stuId
  } else {
    where.openid = openid
  }
  
  const finance = await db.collection('finance').where(where).get()
  
  if (finance.data.length === 0) {
    return { code: 0, data: [] }
  }
  
  const currentFinance = finance.data[0]
  let records = currentFinance.withdrawRecords || []
  
  if (status) {
    records = records.filter(record => record.status === status)
  }
  
  return { code: 0, data: records }
}

async function updateStudent(openid, data) {
  const { avatarUrl } = data

  // 学号由服务端根据 openid 解析，防止修改他人资料
  const student = await db.collection('student').where({ openid }).get()
  if (student.data.length === 0) {
    return { code: -1, msg: '学号不能为空' }
  }

  const stuId = student.data[0].stuId

  try {
    await db.collection('student').doc(student.data[0]._id).update({
      data: {
        avatarUrl,
        updateTime: db.serverDate()
      }
    })

    return { code: 0, msg: '更新成功', data: { stuId } }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}
