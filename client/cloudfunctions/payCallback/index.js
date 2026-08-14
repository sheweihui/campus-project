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
    if (paymentRecord.status === 'prepaid' || paymentRecord.status === 'paid') {
      console.log('重复回调（已处理）:', outTradeNo)
      return { errcode: 0 }
    }

    const { itemId, itemType } = paymentRecord
    const collection = getCollectionByType(itemType)
    if (!collection) {
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

    // 预取商品信息确认存在
    const itemPre = await db.collection(collection).doc(itemId).get()
    if (!itemPre.data) {
      console.error('商品不存在:', itemId)
      return { errcode: 0 }
    }

    const buyerNickName = await getNickName(paymentRecord.buyerOpenid)

    // ============ 事务：标记预支付（资金托管在平台，等确认完成后释放） ============
    const transaction = await db.startTransaction()
    try {
      const tPay = await transaction.collection('payments').doc(paymentRecord._id).get()
      if (!tPay.data) {
        await transaction.rollback()
        return { errcode: 0 }
      }
      if (tPay.data.status === 'prepaid' || tPay.data.status === 'paid') {
        await transaction.rollback()
        return { errcode: 0 }
      }

      const tItem = await transaction.collection(collection).doc(itemId).get()
      if (!tItem.data) {
        await transaction.rollback()
        return { errcode: 0 }
      }

      // 状态守卫：help 类允许 pending/paying，market 类允许 onSale/paying
      const itemStatusOk =
        itemType === 'market'
          ? tItem.data.status === 'onSale' ||
            (tItem.data.status === 'paying' && tItem.data.payOrderNo === outTradeNo)
          : tItem.data.status === 'pending' ||
            (tItem.data.status === 'paying' && tItem.data.payOrderNo === outTradeNo)

      if (!itemStatusOk) {
        console.error('商品状态异常，拒绝支付:', outTradeNo, tItem.data.status)
        await transaction.rollback()
        return { errcode: 0 }
      }

      // 标记预支付（资金托管，不创建订单，不入账接单者）
      await transaction.collection('payments').doc(paymentRecord._id).update({
        data: {
          status: 'prepaid',
          payTime: db.serverDate(),
          commission,
          sellerAmount
        }
      })

      // 更新商品状态：market → sold，help → prepaid
      const itemStatus = itemType === 'market' ? 'sold' : 'prepaid'
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
      return { errcode: -1 }
    }

    // 通知支付者（发布者自己）
    let notifyContent = ''
    if (itemType === 'market') {
      notifyContent = `您的二手商品已售出，金额：${amount}元`
    } else if (itemType === 'express') {
      notifyContent = `代取快递酬金已预付 ¥${amount}，等待他人接单`
    } else {
      notifyContent = `互助酬金已预付 ¥${amount}，等待他人接单`
    }

    await sendMessage({
      toOpenid: paymentRecord.buyerOpenid,
      title: '支付成功',
      content: notifyContent,
      type: 'user',
      relatedId: itemId,
      relatedType: itemType === 'market' ? 'market' : `help-${itemType}`
    })

    return { errcode: 0 }
  } catch (error) {
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
