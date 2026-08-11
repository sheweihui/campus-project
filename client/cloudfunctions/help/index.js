const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'add':
        return await addHelp(data, OPENID)
      case 'list':
        return await listHelp(data)
      case 'detail':
        return await getDetail(data)
      case 'update':
        return await updateHelp(data, OPENID)
      case 'delete':
        return await deleteHelp(data, OPENID)
      case 'myList':
        return await getMyList(OPENID, data)
      case 'updateStatus':
        return await updateStatus(data, OPENID)
      case 'accept':
        return await acceptExpress(data, OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function addHelp(data, openid) {
  // 发布必须完成学号登录（拦截游客）
  const stuId = await getStuIdByOpenid(openid)
  if (!stuId) {
    return { code: -1, msg: '请先完成学号登录后再发布' }
  }

  const collection = getCollectionByType(data.type)

  // 服务端金额校验：酬金必须是合法正数
  if (data.type === 'express' || data.type === 'other') {
    if (!isValidAmount(data.reward)) {
      return { code: -1, msg: '酬金必须是大于 0 且最多两位小数的金额' }
    }
  }

  // 学号由服务端解析，忽略客户端传入的 stuId，防止冒用他人学号
  const { stuId: clientStuId, ...cleanData } = data

  const result = await db.collection(collection).add({
    data: {
      ...cleanData,
      openid,
      stuId,
      status: data.type === 'express' || data.type === 'other' ? 'pending' : 'active',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { code: 0, data: result._id }
}

async function listHelp({ type, page = 1, pageSize = 10 }) {
  const collection = getCollectionByType(type)
  const where = { type }
  
  if (type === 'express' || type === 'other') {
    // 支持 pending, accepted, active, paid 状态（paid 表示已支付，仍可查看）
    where.status = _.in(['pending', 'accepted', 'active', 'paid'])
  } else {
    where.status = 'active'
  }

  const result = await db.collection(collection)
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function getDetail({ type, id }) {
  const collection = getCollectionByType(type)
  const result = await db.collection(collection).doc(id).get()
  if (!result.data) {
    return { code: -1, msg: '数据不存在' }
  }
  return { code: 0, data: { ...result.data, type } }
}

async function updateHelp(data, openid) {
  const { type, id, ...updateData } = data
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  // 学号由服务端维护，不允许通过编辑修改
  delete updateData.stuId
  // 只读字段不允许通过编辑修改
  ;['openid', 'status', 'createTime', 'updateTime', 'acceptorOpenid', 'acceptorStuId', 'acceptTime', 'payTime', 'payOrderNo', 'payClaimTime'].forEach(k => {
    delete updateData[k]
  })

  // 酬金校验：必须为合法正数且最多两位小数；已被接单/支付后锁定
  if (updateData.reward !== undefined) {
    if (!isValidAmount(updateData.reward)) {
      return { code: -1, msg: '酬金必须是大于 0 且最多两位小数的金额' }
    }
    const cur = item.data.status
    if (cur === 'accepted' || cur === 'paying' || cur === 'paid' || cur === 'completed') {
      return { code: -1, msg: '该需求已被接单或已支付，酬金不能修改' }
    }
  }

  await db.collection(collection).doc(id).update({
    data: {
      ...updateData,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '更新成功' }
}

async function deleteHelp({ type, id }, openid) {
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限删除' }
  }

  await db.collection(collection).doc(id).remove()
  return { code: 0, msg: '删除成功' }
}

async function getMyList(openid, { type, stuId, page = 1, pageSize = 10 }) {
  const collection = getCollectionByType(type)
  // 只允许查询自己的发布，忽略客户端传入的 stuId
  const result = await db.collection(collection)
    .where({ openid })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function updateStatus({ type, id, status }, openid) {
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  if (status === 'completed') {
    // 标记为已完成，不再删除，保留商家端统计数据
    await db.collection(collection).doc(id).update({
      data: {
        status: 'completed',
        completeTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    const orders = await db.collection('orders').where({
      itemId: id,
      type
    }).get()

    for (const order of orders.data) {
      await db.collection('orders').doc(order._id).update({
        data: {
          orderStatus: 'completed',
          completeTime: db.serverDate()
        }
      })
    }

    return { code: 0, msg: '已完成' }
  }

  await db.collection(collection).doc(id).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '状态更新成功' }
}

function getCollectionByType(type) {
  const map = {
    'carpool': 'help-carpool',
    'express': 'help-express',
    'partner': 'help-partner',
    'other': 'help-other'
  }
  return map[type] || 'help-carpool'
}

async function acceptExpress(data, openid) {
  const { id, type = 'express' } = data

  // 接单者学号由服务端根据 openid 解析，防止冒充他人接单
  const stuId = await getStuIdByOpenid(openid)

  if (!stuId) {
    return { code: -1, msg: '请先登录' }
  }

  const collection = getCollectionByType(type)

  // 事务：先读状态再写，避免两人同时接同一单
  const transaction = await db.startTransaction()
  try {
    const tItem = await transaction.collection(collection).doc(id).get()
    if (!tItem.data) {
      await transaction.rollback()
      return { code: -1, msg: type === 'express' ? '代取需求不存在' : '互助需求不存在' }
    }

    if (tItem.data.status === 'paid' || tItem.data.status === 'completed') {
      await transaction.rollback()
      return { code: -1, msg: '该需求已结束，无法接单' }
    }

    if (tItem.data.status !== 'pending') {
      await transaction.rollback()
      return { code: -1, msg: '该需求已被接单' }
    }

    await transaction.collection(collection).doc(id).update({
      data: {
        status: 'accepted',
        acceptorOpenid: openid,
        acceptorStuId: stuId,
        acceptTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    await transaction.commit()
  } catch (e) {
    try { await transaction.rollback() } catch (e2) { /* 已回滚 */ }
    console.error('接单事务失败:', e)
    return { code: -1, msg: '接单失败，该需求可能已被接单' }
  }

  // 重新读取需求（含发布者信息），用于后续消息通知
  const item = await db.collection(collection).doc(id).get()

  // 获取接单者信息
  const acceptorInfo = await db.collection('student').where({ stuId }).field({ nickName: true }).get()
  const acceptorNickName = acceptorInfo.data[0]?.nickName || '接单用户'

  // 获取发布者信息
  const publisherInfo = await db.collection('student').where({ stuId: item.data.stuId }).field({ nickName: true }).get()
  const publisherNickName = publisherInfo.data[0]?.nickName || '用户'

  // 给发布者发送消息通知
  const notifyTitle = type === 'express' ? '代取需求被接单' : '互助需求被接单'
  const notifyContent = type === 'express' 
    ? `您发布的代取快递需求已被接单，取件码：${item.data.pickupCode}，请及时支付酬金`
    : `您发布的"${item.data.title}"已被接单，请及时支付酬金`

  await sendMessage({
    toOpenid: item.data.openid,
    title: notifyTitle,
    content: notifyContent,
    type: 'user',
    relatedId: id,
    relatedType: `help-${type}`
  })
  
  // 给接单者发送消息
  await sendMessage({
    toOpenid: openid,
    title: '接单成功',
    content: `您已成功接下"${publisherNickName}"发布的${type === 'express' ? '代取快递' : '"' + item.data.title + '"'}需求，请联系发布者完成互助`,
    type: 'user',
    relatedId: id,
    relatedType: `help-${type}`
  })
  
  return { code: 0, msg: '接单成功' }
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

// 校验调用者是否已绑定学号
async function requireStudent(openid) {
  try {
    const res = await db.collection('student').where({ openid }).get()
    return res.data.length > 0 && !!res.data[0].stuId
  } catch (e) {
    return false
  }
}

// 金额校验：合法正数且最多两位小数
function isValidAmount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return false
  return Math.abs(num * 100 - Math.round(num * 100)) <= 0.001
}

async function sendMessage(messageData) {
  try {
    let toStuId = messageData.toStuId || ''
    
    if (!toStuId && messageData.toOpenid) {
      const userRes = await db.collection('student').where({ openid: messageData.toOpenid }).get()
      if (userRes.data.length > 0) {
        toStuId = userRes.data[0].stuId || ''
      }
    }
    
    await db.collection('messages').add({
      data: {
        ...messageData,
        toStuId,
        isRead: false,
        createTime: db.serverDate()
      }
    })
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}
