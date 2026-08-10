const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()
const MERCHANT_ID = '1115083816'

// 商品被占位（已下单未支付）超过该时长后允许重新下单
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000

// 与 payCallback 中保持一致的集合映射
function getCollectionByType(itemType) {
  const map = {
    'carpool': 'help-carpool',
    'express': 'help-express',
    'partner': 'help-partner',
    'other': 'help-other',
    'market': 'market'
  }
  return map[itemType] || null
}

// 校验商品/需求是否可支付：状态正确 + 金额与服务端一致 + 不能购买自己的发布
async function validateItem(itemType, itemId, amount, openid) {
  const collection = getCollectionByType(itemType)
  if (!collection) {
    return { ok: false, msg: '无效的商品类型' }
  }

  const itemRes = await db.collection(collection).doc(itemId).get()
  if (!itemRes.data) {
    return { ok: false, msg: itemType === 'market' ? '商品不存在' : '需求不存在' }
  }
  const item = itemRes.data

  if (itemType === 'market') {
    if (item.status !== 'onSale' && item.status !== 'paying') {
      return { ok: false, msg: '商品已售出或已下架' }
    }
    if (Math.abs((item.price || 0) - amount) > 0.001) {
      return { ok: false, msg: '支付金额与商品价格不一致' }
    }
    if (item.openid === openid) {
      return { ok: false, msg: '不能购买自己发布的商品' }
    }
  } else {
    // 帮助类：必须是已接单状态，金额与酬金一致
    if (item.status !== 'accepted' && item.status !== 'paying') {
      return { ok: false, msg: '该需求尚未接单，无法支付' }
    }
    if (Math.abs((item.reward || 0) - amount) > 0.001) {
      return { ok: false, msg: '支付金额与酬金不一致' }
    }
    if (item.openid === openid) {
      return { ok: false, msg: '不能支付自己发布的需求' }
    }
  }

  return { ok: true, item }
}

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'unifiedOrder':
        return await unifiedOrder(data, OPENID)
      case 'query':
        return await queryOrder(data)
      case 'close':
        return await closeOrder(data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('支付云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}

async function unifiedOrder(data, openid) {
  const { itemId, amount, description, itemType } = data
  const outTradeNo = `${Date.now()}_${openid.slice(-8)}_${Math.random().toString(36).slice(2, 8)}`

  try {
    // 下单前校验商品状态和金额，防止重复售卖/金额篡改
    const check = await validateItem(itemType, itemId, amount, openid)
    if (!check.ok) {
      return { code: -1, msg: check.msg }
    }

    console.log('开始统一下单:', { itemId, amount, description, itemType, outTradeNo })

    // 先写入支付记录，再占位商品
    const payAdd = await db.collection('payments').add({
      data: {
        outTradeNo,
        itemId,
        itemType,
        buyerOpenid: openid,
        amount,
        status: 'pending',
        createTime: db.serverDate()
      }
    })

    // 原子占位商品，防止同一商品被两个买家同时下单
    const claim = await claimItem(itemType, itemId, outTradeNo, openid)
    if (!claim.ok) {
      await db.collection('payments').doc(payAdd._id).update({
        data: { status: 'cancelled', cancelReason: claim.msg }
      })
      return { code: -1, msg: claim.msg }
    }

    const res = await cloud.cloudPay.unifiedOrder({
      body: description || '校园互助酬金',
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: MERCHANT_ID,
      totalFee: Math.round(amount * 100),
      envId: ENV_ID,
      functionName: 'payCallback',
      attach: JSON.stringify({ itemId, itemType })
    })

    console.log('cloudPay统一下单返回:', res)

    if (res.returnCode !== 'SUCCESS') {
      throw new Error(res.returnMsg || '统一下单通信失败')
    }

    if (res.resultCode !== 'SUCCESS') {
      throw new Error(res.errCodeDes || res.errCode || '统一下单失败')
    }

    return { code: 0, data: { payment: res.payment, outTradeNo } }
  } catch (error) {
    console.error('统一下单失败:', error)
    // 下单失败：释放商品占用，标记支付记录为取消
    await releaseClaim(itemType, itemId, outTradeNo)
    try {
      await db.collection('payments').where({ outTradeNo }).update({
        data: { status: 'cancelled', cancelReason: error.message }
      })
    } catch (e) { /* 忽略 */ }
    return { code: -1, msg: error.message }
  }
}

// 原子占位：market 从 onSale 占为 paying；帮助类从 accepted 占为 paying
async function claimItem(itemType, itemId, outTradeNo, openid) {
  const collection = getCollectionByType(itemType)
  const expectedStatus = itemType === 'market' ? 'onSale' : 'accepted'

  try {
    const claimRes = await db.collection(collection)
      .where({ _id: itemId, status: expectedStatus })
      .update({
        data: {
          status: 'paying',
          payOrderNo: outTradeNo,
          payClaimTime: db.serverDate()
        }
      })

    if (claimRes.stats.updated > 0) {
      return { ok: true }
    }

    // 占位失败：检查当前状态，决定是否允许重试/抢占
    const itemRes = await db.collection(collection).doc(itemId).get()
    const item = itemRes.data
    if (!item) {
      return { ok: false, msg: itemType === 'market' ? '商品不存在' : '需求不存在' }
    }

    if (item.status === 'paying' && item.payOrderNo === outTradeNo) {
      // 同一交易号重试，直接放行
      return { ok: true }
    }

    if (item.status === 'paying') {
      // 该占用是否属于当前用户（重复下单）：释放旧占用
      const oldPayment = await db.collection('payments')
        .where({ outTradeNo: item.payOrderNo })
        .get()
      if (oldPayment.data.length > 0 && oldPayment.data[0].buyerOpenid === openid) {
        await db.collection(collection)
          .where({ _id: itemId, status: 'paying', payOrderNo: item.payOrderNo })
          .update({
            data: {
              status: expectedStatus,
              payOrderNo: db.command.remove(),
              payClaimTime: db.command.remove()
            }
          })
        await db.collection('payments').doc(oldPayment.data[0]._id).update({
          data: { status: 'cancelled', cancelReason: '用户重新下单' }
        })
        // 释放成功后重新占位
        const reclaim = await db.collection(collection)
          .where({ _id: itemId, status: expectedStatus })
          .update({
            data: {
              status: 'paying',
              payOrderNo: outTradeNo,
              payClaimTime: db.serverDate()
            }
          })
        if (reclaim.stats.updated > 0) {
          return { ok: true }
        }
      }

      // 超过占位超时时间：允许抢占
      const claimTime = item.payClaimTime ? new Date(item.payClaimTime).getTime() : 0
      if (claimTime && Date.now() - claimTime > CLAIM_TIMEOUT_MS) {
        const staleClaim = await db.collection(collection)
          .where({ _id: itemId, status: 'paying', payOrderNo: item.payOrderNo })
          .update({
            data: {
              status: expectedStatus,
              payOrderNo: db.command.remove(),
              payClaimTime: db.command.remove()
            }
          })
        if (staleClaim.stats.updated > 0) {
          await db.collection('payments').where({ outTradeNo: item.payOrderNo }).update({
            data: { status: 'cancelled', cancelReason: '占位超时' }
          })
          const reclaim = await db.collection(collection)
            .where({ _id: itemId, status: expectedStatus })
            .update({
              data: {
                status: 'paying',
                payOrderNo: outTradeNo,
                payClaimTime: db.serverDate()
              }
            })
          if (reclaim.stats.updated > 0) {
            return { ok: true }
          }
        }
      }

      return { ok: false, msg: itemType === 'market' ? '商品正在交易中，请稍后再试' : '该需求正在支付中，请稍后再试' }
    }

    return { ok: false, msg: itemType === 'market' ? '商品已售出或已下架' : '该需求已被接单或已失效' }
  } catch (e) {
    console.error('占位商品失败:', e)
    return { ok: false, msg: '下单失败，请重试' }
  }
}

// 释放商品占用（支付取消/失败时）
async function releaseClaim(itemType, itemId, outTradeNo) {
  if (!itemType || !itemId || !outTradeNo) return
  const collection = getCollectionByType(itemType)
  if (!collection) return
  const expectedStatus = itemType === 'market' ? 'onSale' : 'accepted'
  try {
    await db.collection(collection)
      .where({ _id: itemId, status: 'paying', payOrderNo: outTradeNo })
      .update({
        data: {
          status: expectedStatus,
          payOrderNo: db.command.remove(),
          payClaimTime: db.command.remove()
        }
      })
  } catch (e) {
    console.error('释放商品占用失败:', e)
  }
}

async function queryOrder({ outTradeNo }) {
  const res = await cloud.cloudPay.queryOrder({ outTradeNo })
  return { code: 0, data: res }
}

async function closeOrder(data) {
  const { outTradeNo } = data
  if (!outTradeNo) {
    return { code: -1, msg: '缺少交易号' }
  }

  try {
    // 查询支付记录，释放商品占用
    const payRes = await db.collection('payments').where({ outTradeNo }).get()
    if (payRes.data.length > 0) {
      const pay = payRes.data[0]
      if (pay.status === 'pending') {
        await releaseClaim(pay.itemType, pay.itemId, outTradeNo)
        await db.collection('payments').doc(pay._id).update({
          data: { status: 'cancelled', cancelReason: '用户取消支付' }
        })
      }
    }

    // 关闭微信支付订单（若已支付会失败，忽略即可）
    try {
      await cloud.cloudPay.closeOrder({ outTradeNo })
    } catch (e) {
      console.log('关闭微信订单失败（可能已支付）:', e.message || e)
    }

    return { code: 0, msg: '订单已关闭' }
  } catch (error) {
    console.error('关闭订单失败:', error)
    return { code: -1, msg: error.message }
  }
}
