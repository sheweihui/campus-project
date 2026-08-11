const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    console.log('支付回调数据:', event)

    const returnCode = event.returnCode || event.return_code
    const resultCode = event.resultCode || event.result_code
    const outTradeNo = event.outTradeNo || event.out_trade_no
    const totalFee = parseInt(event.totalFee || event.total_fee || 0, 10)

    if (returnCode !== 'SUCCESS') {
      console.error('支付回调通信失败:', event.returnMsg || event.return_msg)
      return { errcode: 0 }
    }

    if (resultCode !== 'SUCCESS') {
      console.error('支付结果失败:', event.errCode || event.err_code, event.errCodeDes || event.err_code_des)
      return { errcode: 0 }
    }

    console.log('支付成功:', { outTradeNo, totalFee })

    const payment = await db.collection('payments').where({ outTradeNo }).get()
    if (payment.data.length === 0) {
      console.error('支付记录不存在:', outTradeNo)
      return { errcode: 0 }
    }

    const paymentRecord = payment.data[0]
    if (paymentRecord.status === 'paid' && paymentRecord.financeCredited) {
      console.log('重复回调（已处理）:', outTradeNo)
      return { errcode: 0 }
    }

    const { itemId, itemType } = paymentRecord
    const collection = getCollectionByType(itemType)
    if (!collection) {
      // 未知类型属于确定性失败，不重试
      console.error('无效的支付类型:', itemType)
      return { errcode: 0 }
    }

    const amount = Number(paymentRecord.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('支付金额非法:', outTradeNo, amount)
      return { errcode: 0 }
    }

    const commissionRate = 0.15
    const commission = parseFloat((amount * commissionRate).toFixed(2))
    const sellerAmount = parseFloat((amount - commission).toFixed(2))

    // 订单 ID 由交易号派生，天然幂等
    const orderId = `ord_${outTradeNo}`
    let orderExists = false
    try {
      const existing = await db.collection('orders').doc(orderId).get()
      orderExists = !!existing.data
    } catch (e) {
      orderExists = false
    }

    // 兼容旧数据：支付已标记但订单缺失（旧代码的中间状态），无法自动补全，记录日志人工核对
    if (paymentRecord.status === 'paid' && orderExists) {
      console.warn('历史支付记录，订单已存在，跳过:', outTradeNo)
      return { errcode: 0 }
    }

    // 预取买卖双方昵称（尽力而为）
    const itemPre = await db.collection(collection).doc(itemId).get()
    if (!itemPre.data) {
      console.error('商品不存在:', itemId)
      return { errcode: 0 }
    }
    const sellerOpenid = itemType === 'market' ? itemPre.data.openid : itemPre.data.acceptorOpenid
    const [buyerInfo, sellerInfo] = await Promise.all([
      getNickName(paymentRecord.buyerOpenid),
      getNickName(sellerOpenid)
    ])

    // 预查财务记录（事务内只能按 doc 操作，因此先查出 _id）
    let financeDoc = null
    let sellerStuId = ''
    if (sellerOpenid) {
      const financeRes = await db.collection('finance').where({ openid: sellerOpenid }).get()
      if (financeRes.data.length > 0) {
        financeDoc = financeRes.data[0]
      }
      const sRes = await db.collection('student').where({ openid: sellerOpenid }).get()
      if (sRes.data.length > 0) {
        sellerStuId = sRes.data[0].stuId || ''
      }
    }

    // ============ 事务：全部成功或全部回滚 ============
    const transaction = await db.startTransaction()
    try {
      const tPay = await transaction.collection('payments').doc(paymentRecord._id).get()
      if (!tPay.data) {
        await transaction.rollback()
        return { errcode: 0 }
      }
      if (tPay.data.status === 'paid') {
        await transaction.rollback()
        return { errcode: 0 }
      }

      const tItem = await transaction.collection(collection).doc(itemId).get()
      if (!tItem.data) {
        await transaction.rollback()
        return { errcode: 0 }
      }

      // 商品状态守卫：只允许尚未售出的商品完成交易
      const itemStatusOk =
        itemType === 'market'
          ? tItem.data.status === 'onSale' ||
            (tItem.data.status === 'paying' && tItem.data.payOrderNo === outTradeNo)
          : tItem.data.status === 'accepted' ||
            (tItem.data.status === 'paying' && tItem.data.payOrderNo === outTradeNo)

      if (!itemStatusOk) {
        console.error('商品状态异常，拒绝入账（需人工处理退款）:', outTradeNo, tItem.data.status)
        await transaction.rollback()
        return { errcode: 0 }
      }

      // 创建订单（幂等：_id 由交易号派生）
      await transaction.collection('orders').doc(orderId).set({
        data: {
          type: itemType,
          itemId,
          buyerOpenid: paymentRecord.buyerOpenid,
          sellerOpenid: sellerOpenid || '',
          buyerNickName: buyerInfo || '',
          sellerNickName: sellerInfo || '',
          amount,
          commission,
          sellerAmount,
          paymentStatus: 'paid',
          // 支付成功即视为订单完成（卖家在支付回调时已入账）
          orderStatus: 'completed',
          outTradeNo,
          createTime: db.serverDate(),
          payTime: db.serverDate()
        }
      })

      // 卖家入账（同一事务内原子完成）
      if (sellerOpenid) {
        const newFinanceId = `fin_${sellerOpenid}`
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
          // 固定 ID 文档：事务内先读，存在则更新（并发首单时另一事务可能已创建），不存在则创建
          let tFinance = null
          try {
            tFinance = await transaction.collection('finance').doc(newFinanceId).get()
          } catch (e) {
            tFinance = null
          }
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
                openid: sellerOpenid,
                stuId: sellerStuId,
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
      }

      // 标记支付完成（幂等标记，重试安全）
      await transaction.collection('payments').doc(paymentRecord._id).update({
        data: {
          status: 'paid',
          payTime: db.serverDate(),
          commission,
          sellerAmount,
          financeCredited: true
        }
      })

      // 更新商品状态：市场标记 sold，帮助类标记 paid
      const itemStatus = itemType === 'market' ? 'sold' : 'paid'
      await transaction.collection(collection).doc(itemId).update({
        data: {
          status: itemStatus,
          payTime: db.serverDate()
        }
      })

      await transaction.commit()
    } catch (e) {
      try { await transaction.rollback() } catch (e2) { /* 已回滚 */ }
      console.error('支付回调事务失败:', e)
      // 非确定性失败返回非 0，让微信稍后重试
      return { errcode: -1 }
    }

    // 事务已提交，此后只做尽力而为的通知，不再影响资金
    if (sellerOpenid) {
      let notifyContent = ''
      if (itemType === 'market') {
        notifyContent = `您的二手商品已售出，金额：${amount}元`
      } else if (itemType === 'express') {
        notifyContent = `代取快递酬金已支付，金额：${amount}元，请及时完成代取`
      } else {
        notifyContent = `互助酬金已支付，金额：${amount}元，请及时完成互助`
      }

      await sendMessage({
        toOpenid: sellerOpenid,
        title: '收到酬金支付',
        content: notifyContent,
        type: 'user',
        relatedId: itemId,
        relatedType: itemType === 'market' ? 'market' : `help-${itemType}`
      })
    }

    return { errcode: 0 }
  } catch (error) {
    // 异常返回非 0，让微信云支付稍后重试；处理逻辑已幂等，重试安全
    console.error('支付回调处理错误:', error)
    return { errcode: -1 }
  }
}

function getCollectionByType(type) {
  const map = {
    'carpool': 'help-carpool',
    'express': 'help-express',
    'partner': 'help-partner',
    'other': 'help-other',
    'market': 'market'
  }
  return map[type] || null
}

async function getNickName(openid) {
  if (!openid) return ''
  try {
    const res = await db.collection('student').where({ openid }).field({ name: true, nickName: true }).get()
    if (res.data.length > 0) {
      return res.data[0].nickName || res.data[0].name || ''
    }
    const userRes = await db.collection('users').where({ openid }).field({ nickName: true }).get()
    return userRes.data.length > 0 ? (userRes.data[0].nickName || '') : ''
  } catch (e) {
    return ''
  }
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
