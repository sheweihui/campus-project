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
  // 发布必须完成微信登录并绑定手机号（拦截游客）
  const phone = await getPhoneByOpenid(openid)
  if (!phone) {
    return { code: -1, msg: '请先完成微信登录并绑定手机号后再发布' }
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
      phone,
      stuId: '',
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
    // 支持 pending（待支付）、prepaid（已预付待接单）、accepted、paid、active 状态
    where.status = _.in(['pending', 'prepaid', 'accepted', 'active', 'paid'])
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

  // 酬金校验：必须为合法正数且最多两位小数；已被接单/预付/支付后锁定
  if (updateData.reward !== undefined) {
    if (!isValidAmount(updateData.reward)) {
      return { code: -1, msg: '酬金必须是大于 0 且最多两位小数的金额' }
    }
    const cur = item.data.status
    if (cur === 'prepaid' || cur === 'accepted' || cur === 'paying' || cur === 'paid' || cur === 'completed') {
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
    // 如果有预支付订单号，需要释放资金给接单者
    if (item.data.payOrderNo && item.data.acceptorOpenid) {
      return await completeWithRelease(collection, item.data, id, type)
    }

    // 无支付的订单直接标记完成
    await db.collection(collection).doc(id).update({
      data: {
        status: 'completed',
        completeTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 更新关联 orders
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

// 确认完成并释放资金给接单者
async function completeWithRelease(collection, item, id, type) {
  const outTradeNo = item.payOrderNo
  const acceptorOpenid = item.acceptorOpenid

  // 查找预支付记录
  const payRes = await db.collection('payments').where({ outTradeNo, status: 'prepaid' }).get()
  if (payRes.data.length === 0) {
    return { code: -1, msg: '未找到预支付记录，无法放款' }
  }

  const payment = payRes.data[0]
  const amount = Number(payment.amount)
  const commissionRate = 0.15
  const commission = parseFloat((amount * commissionRate).toFixed(2))
  const sellerAmount = parseFloat((amount - commission).toFixed(2))
  const orderId = `ord_${outTradeNo}`

  // 获取买卖双方信息
  const [buyerNick, sellerNick] = await Promise.all([
    getNickName(payment.buyerOpenid),
    getNickName(acceptorOpenid)
  ])

  // 预查财务记录
  const financeRes = await db.collection('finance').where({ openid: acceptorOpenid }).get()
  const financeDoc = financeRes.data.length > 0 ? financeRes.data[0] : null

  // 事务：放款 + 创建订单 + 更新状态
  const transaction = await db.startTransaction()
  try {
    // 双重检查支付状态
    const tPay = await transaction.collection('payments').doc(payment._id).get()
    if (!tPay.data || tPay.data.status !== 'prepaid') {
      await transaction.rollback()
      return { code: -1, msg: '支付状态异常，无法放款' }
    }

    // 双重检查商品状态
    const tItem = await transaction.collection(collection).doc(id).get()
    if (!tItem.data || tItem.data.status !== 'accepted') {
      await transaction.rollback()
      return { code: -1, msg: '订单状态异常，无法完成' }
    }

    // 创建订单记录
    await transaction.collection('orders').doc(orderId).set({
      data: {
        type,
        itemId: id,
        buyerOpenid: payment.buyerOpenid,
        sellerOpenid: acceptorOpenid,
        buyerNickName: buyerNick || '',
        sellerNickName: sellerNick || '',
        amount,
        commission,
        sellerAmount,
        paymentStatus: 'paid',
        orderStatus: 'completed',
        outTradeNo,
        createTime: db.serverDate(),
        payTime: payment.payTime || db.serverDate(),
        completeTime: db.serverDate()
      }
    })

    // 接单者入账
    const newFinanceId = `fin_${acceptorOpenid}`
    if (financeDoc) {
      const tFinance = await transaction.collection('finance').doc(financeDoc._id).get()
      const f = tFinance.data
      await transaction.collection('finance').doc(financeDoc._id).update({
        data: {
          totalCommission: (f.totalCommission || 0) + commission,
          availableAmount: (f.availableAmount || 0) + sellerAmount,
          updateTime: db.serverDate()
        }
      })
    } else {
      let tFinance = null
      try {
        tFinance = await transaction.collection('finance').doc(newFinanceId).get()
      } catch (e) { tFinance = null }
      if (tFinance && tFinance.data) {
        const f = tFinance.data
        await transaction.collection('finance').doc(newFinanceId).update({
          data: {
            totalCommission: (f.totalCommission || 0) + commission,
            availableAmount: (f.availableAmount || 0) + sellerAmount,
            updateTime: db.serverDate()
          }
        })
      } else {
        await transaction.collection('finance').doc(newFinanceId).set({
          data: {
            openid: acceptorOpenid,
            totalCommission: commission,
            availableAmount: sellerAmount,
            withdrawAmount: 0,
            withdrawRecords: [],
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }
    }

    // 标记支付完成
    await transaction.collection('payments').doc(payment._id).update({
      data: {
        status: 'paid',
        commission,
        sellerAmount,
        financeCredited: true
      }
    })

    // 标记商品完成
    await transaction.collection(collection).doc(id).update({
      data: {
        status: 'completed',
        completeTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    await transaction.commit()
  } catch (e) {
    try { await transaction.rollback() } catch (e2) { /* 已回滚 */ }
    console.error('放款事务失败:', e)
    return { code: -1, msg: '放款失败，请重试' }
  }

  // 通知接单者收到款项
  let notifyContent = ''
  if (type === 'express') {
    notifyContent = `代取快递酬金 ¥${sellerAmount} 已到账（总¥${amount}，平台服务费¥${commission}）`
  } else {
    notifyContent = `互助酬金 ¥${sellerAmount} 已到账（总¥${amount}，平台服务费¥${commission}）`
  }

  await sendMessage({
    toOpenid: acceptorOpenid,
    title: '酬金已到账',
    content: notifyContent,
    type: 'user',
    relatedId: id,
    relatedType: `help-${type}`
  })

  return { code: 0, msg: '已完成，酬金已打给接单者' }
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

  // 必须绑定手机号（拦截游客）
  const phone = await getPhoneByOpenid(openid)
  if (!phone) {
    return { code: -1, msg: '请先完成微信登录并绑定手机号' }
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

    // 只有已预付（prepaid）的需求才能接单
    if (tItem.data.status !== 'prepaid') {
      await transaction.rollback()
      return { code: -1, msg: '该需求尚未预付酬金，无法接单' }
    }

    await transaction.collection(collection).doc(id).update({
      data: {
        status: 'accepted',
        acceptorOpenid: openid,
        acceptorStuId: phone,
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
  const acceptorInfo = await db.collection('users').where({ openid }).get()
  const acceptorNickName = acceptorInfo.data[0]?.nickName || '接单用户'

  // 获取发布者信息
  const publisherInfo = await db.collection('users').where({ openid: item.data.openid }).get()
  const publisherNickName = publisherInfo.data[0]?.nickName || '用户'

  // 给发布者发送消息通知（钱已预付，只需通知有人接单）
  const notifyTitle = type === 'express' ? '代取需求被接单' : '互助需求被接单'
  const notifyContent = type === 'express'
    ? `您发布的代取快递需求已被接单，取件码：${item.data.pickupCode}，完成后请确认放款`
    : `您发布的"${item.data.title}"已被接单，完成后请确认放款`

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
    content: `您已成功接下"${publisherNickName}"发布的${type === 'express' ? '代取快递' : '"' + item.data.title + '"'}需求，酬金已由平台托管，完成后自动到账`,
    type: 'user',
    relatedId: id,
    relatedType: `help-${type}`
  })

  return { code: 0, msg: '接单成功' }
}

// 通过 openid 查询绑定的手机号
async function getPhoneByOpenid(openid) {
  if (!openid) return ''
  try {
    const res = await db.collection('users').where({ openid }).get()
    return res.data.length > 0 ? (res.data[0].phone || '') : ''
  } catch (e) {
    return ''
  }
}

// 金额校验：合法正数且最多两位小数
function isValidAmount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return false
  return Math.abs(num * 100 - Math.round(num * 100)) <= 0.001
}

// 获取用户昵称
async function getNickName(openid) {
  if (!openid) return ''
  try {
    const userRes = await db.collection('users').where({ openid }).get()
    if (userRes.data.length > 0) {
      const u = userRes.data[0]
      if (u.name) return u.name
      if (u.nickName) return u.nickName
    }
  } catch (e) {
    return ''
  }
  return ''
}

async function sendMessage(messageData) {
  try {
    await db.collection('messages').add({
      data: {
        ...messageData,
        toOpenid: messageData.toOpenid || '',
        isRead: false,
        createTime: db.serverDate()
      }
    })
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}
