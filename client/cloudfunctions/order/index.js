const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'complete':
        return await completeOrder(data, OPENID)
      case 'cancel':
        return await cancelOrder(data, OPENID)
      case 'list':
        return await listOrders(OPENID, data)
      case 'detail':
        return await getOrderDetail(data, OPENID)
      case 'myOrders':
        return await getMyOrders(OPENID, data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function completeOrder(data, openid) {
  const { orderId } = data
  const order = await db.collection('orders').doc(orderId).get()
  
  if (!order.data) {
    return { code: -1, msg: '订单不存在' }
  }
  
  if (order.data.buyerOpenid !== openid) {
    return { code: -1, msg: '无权限操作' }
  }
  
  // 标记完成而非删除，保留订单用于商家端统计
  await db.collection('orders').doc(orderId).update({
    data: {
      orderStatus: 'completed',
      completeTime: db.serverDate()
    }
  })

  return { code: 0, msg: '订单已完成' }
}

async function cancelOrder(data, openid) {
  const { orderId } = data
  const order = await db.collection('orders').doc(orderId).get()
  
  if (!order.data) {
    return { code: -1, msg: '订单不存在' }
  }
  
  if (order.data.buyerOpenid !== openid && order.data.sellerOpenid !== openid) {
    return { code: -1, msg: '无权限操作' }
  }
  
  await db.collection('orders').doc(orderId).update({
    data: {
      orderStatus: 'cancelled',
      completeTime: db.serverDate()
    }
  })
  
  return { code: 0, msg: '订单已取消' }
}

async function listOrders(openid, { page = 1, pageSize = 10 }) {
  // 只返回调用者作为买家或卖家的订单，避免任何人拉取全量订单
  const result = await db.collection('orders')
    .where(_.and([
      { orderStatus: _.neq('cancelled') },
      _.or([
        { buyerOpenid: openid },
        { sellerOpenid: openid }
      ])
    ]))
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return { code: 0, data: result.data }
}

async function getOrderDetail({ orderId }, openid) {
  const result = await db.collection('orders').doc(orderId).get()
  if (!result.data) {
    return { code: -1, msg: '订单不存在' }
  }
  // 只有买家或卖家能看详情
  if (result.data.buyerOpenid !== openid && result.data.sellerOpenid !== openid) {
    return { code: -1, msg: '无权限查看' }
  }
  return { code: 0, data: result.data }
}

async function getMyOrders(openid, { page = 1, pageSize = 10 }) {
  const result = await db.collection('orders')
    .where(_.or([
      { buyerOpenid: openid },
      { sellerOpenid: openid }
    ]))
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}
