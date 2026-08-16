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
      case 'loginByPhone':
        return await loginByPhone(OPENID, data)
      case 'getInfo':
        return await getUserInfo(OPENID, data)
      case 'getPublicInfo':
        return await getPublicInfo(OPENID, data)
      case 'update':
        return await updateUser(OPENID, data)
      case 'getStats':
        return await getUserStats(OPENID, data)
      case 'getFinance':
        return await getFinance(OPENID, data)
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
  // 防止客户端注入 openid/code 覆盖服务端身份（code 是 wx.login 临时码，无保存价值）
  const cleanData = { ...(data || {}) }
  delete cleanData.openid
  delete cleanData.code

  if (user.data.length === 0) {
    await db.collection('users').add({
      data: {
        openid,
        ...cleanData,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    await db.collection('users').doc(user.data[0]._id).update({
      data: {
        ...cleanData,
        updateTime: db.serverDate()
      }
    })
  }

  return { code: 0, msg: '登录成功', data: { openid } }
}

// 微信手机号一键登录：用手机号快速验证组件返回的 code 换取真实手机号并绑定
async function loginByPhone(openid, data) {
  const { code } = data || {}
  if (!code) {
    return { code: -1, msg: '缺少授权code' }
  }

  let phone = ''
  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    phone = (res && res.phoneInfo && res.phoneInfo.phoneNumber) || ''
  } catch (e) {
    console.error('获取手机号失败:', e)
    return { code: -1, msg: '获取手机号失败，请重试' }
  }

  if (!phone) {
    return { code: -1, msg: '未获取到手机号' }
  }

  const user = await db.collection('users').where({ openid }).get()

  if (user.data.length === 0) {
    await db.collection('users').add({
      data: {
        openid,
        phone,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
    const updateData = { phone, updateTime: db.serverDate() }
    await db.collection('users').doc(user.data[0]._id).update({ data: updateData })
  }

  return { code: 0, msg: '登录成功', data: { openid, phone } }
}

async function getUserInfo(openid, data) {
  const user = await db.collection('users').where({ openid }).get()

  if (user.data.length === 0) {
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

  // 只能查询自己的信息，忽略客户端传入的 openid
  return { code: 0, data: user.data[0] }
}

// 查询他人公开信息（用于聊天展示）：昵称/头像/脱敏手机号
async function getPublicInfo(openid, data) {
  const { targetOpenid } = data || {}
  if (!targetOpenid) {
    return { code: -1, msg: '缺少openid' }
  }
  const res = await db.collection('users').where({ openid: targetOpenid }).get()
  if (res.data.length === 0) {
    return { code: 0, data: { openid: targetOpenid, nickName: '用户' } }
  }
  const u = res.data[0]
  const phoneMask = u.phone
    ? `${u.phone.slice(0, 3)}****${u.phone.slice(-4)}`
    : ''
  return {
    code: 0,
    data: {
      openid: u.openid,
      nickName: u.nickName || '',
      avatarUrl: u.avatarUrl || '',
      phoneMask
    }
  }
}

async function updateUser(openid, data) {
  const user = await db.collection('users').where({ openid }).get()
  // 防止客户端注入 openid/code 覆盖服务端身份
  const cleanData = { ...(data || {}) }
  delete cleanData.openid
  delete cleanData.code

  if (user.data.length === 0) {
    await db.collection('users').add({
      data: {
        openid,
        ...cleanData,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  } else {
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
  const lostfoundCount = await safeCount(db.collection('lostfound').where({ openid }))
  const marketCount = await safeCount(db.collection('market').where({ openid }))
  const carpoolCount = await safeCount(db.collection('help-carpool').where({ openid }))
  const expressCount = await safeCount(db.collection('help-express').where({ openid }))
  const partnerCount = await safeCount(db.collection('help-partner').where({ openid }))
  const otherCount = await safeCount(db.collection('help-other').where({ openid }))

  let unreadMessages = 0
  try {
    unreadMessages = await safeCount(db.collection('messages').where({
      toOpenid: openid,
      isRead: false
    }))
  } catch (error) {
    console.error('获取未读消息数失败:', error)
  }

  return {
    code: 0,
    data: {
      lostfound: lostfoundCount,
      market: marketCount,
      help: carpoolCount + expressCount + partnerCount + otherCount,
      unreadMessages
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

async function getFinance(openid, data) {
  const finance = await db.collection('finance').where({ openid }).get()

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
  const { status } = data || {}
  const finance = await db.collection('finance').where({ openid }).get()

  if (finance.data.length === 0) {
    return { code: 0, data: [] }
  }

  const currentFinance = finance.data[0]
  let records = currentFinance.withdrawRecords || []

  if (status) {
    records = records.filter(record => record.status === status)
  }

  // 隐私保护：返回给用户的银行卡号脱敏（完整卡号仅商家端管理员可见）
  records = records.map(r => {
    if (r.bankCard) {
      const card = String(r.bankCard)
      return { ...r, bankCard: card.length > 8 ? card.slice(0, 4) + ' **** **** ' + card.slice(-4) : '****' + card.slice(-4) }
    }
    return r
  })

  return { code: 0, data: records }
}
