const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'transfer':
        return await doTransfer(data, OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('转账云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}

// 提现申请：只记账（扣减余额、生成待处理记录），由平台人工打款到银行卡
async function doTransfer(data, openid) {
  const { amount, partnerTradeNo, realName, bankCard, remark } = data

  // 金额校验：正数且最多两位小数
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { code: -1, msg: '提现金额不合法' }
  }
  const amountCents = Math.round(numericAmount * 100)
  if (Math.abs(numericAmount * 100 - amountCents) > 0.001) {
    return { code: -1, msg: '提现金额最多两位小数' }
  }
  const finalAmount = amountCents / 100

  if (finalAmount < 1) {
    return { code: -1, msg: '最低提现金额为 ¥1' }
  }
  if (!partnerTradeNo) {
    return { code: -1, msg: '交易号不能为空' }
  }

  const cleanName = String(realName || '').trim()
  const cleanBankCard = String(bankCard || '').trim()
  if (!cleanName) {
    return { code: -1, msg: '请填写持卡人姓名' }
  }
  if (!cleanBankCard) {
    return { code: -1, msg: '请填写银行卡号' }
  }

  const financeRes = await db.collection('finance').where({ openid }).get()
  if (financeRes.data.length === 0) {
    return { code: -1, msg: '财务信息不存在' }
  }
  const finance = financeRes.data[0]

  // 事务：校验余额 + 幂等（同一交易号不重复），先行扣款占位
  const transaction = await db.startTransaction()
  try {
    const tDoc = await transaction.collection('finance').doc(finance._id).get()
    if (!tDoc.data) {
      await transaction.rollback()
      return { code: -1, msg: '财务信息不存在' }
    }

    const current = tDoc.data
    if (finalAmount > (current.availableAmount || 0)) {
      await transaction.rollback()
      return { code: -1, msg: '可提现金额不足' }
    }

    const dup = (current.withdrawRecords || []).find(r => r.partnerTradeNo === partnerTradeNo)
    if (dup) {
      await transaction.rollback()
      return { code: -1, msg: '该提现申请处理中，请勿重复提交' }
    }

    const newRecords = [...(current.withdrawRecords || []), {
      amount: finalAmount,
      partnerTradeNo,
      realName: cleanName,
      bankCard: cleanBankCard,
      remark: remark || '',
      status: 'pending',
      source: 'manual',
      createTime: new Date()
    }]

    await transaction.collection('finance').doc(finance._id).update({
      data: {
        availableAmount: Math.round(((current.availableAmount || 0) - finalAmount) * 100) / 100,
        withdrawAmount: Math.round(((current.withdrawAmount || 0) + finalAmount) * 100) / 100,
        withdrawRecords: newRecords,
        updateTime: new Date()
      }
    })

    await transaction.commit()
  } catch (e) {
    try { await transaction.rollback() } catch (e2) { /* 已回滚 */ }
    console.error('提现申请失败:', e)
    return { code: -1, msg: '提现申请失败，请重试' }
  }

  return { code: 0, msg: '提现申请已提交，等待平台打款' }
}
