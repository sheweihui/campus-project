const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'transfer':
        return await doTransfer(data, OPENID)
      case 'query':
        return await queryTransfer(data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('转账云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}

async function doTransfer(data, openid) {
  const { amount, partnerTradeNo, realName, remark } = data

  // 严格金额校验：必须为正数且最多两位小数，防止 NaN/负数/字符串绕过
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { code: -1, msg: '提现金额不合法' }
  }
  const amountCents = Math.round(numericAmount * 100)
  if (Math.abs(numericAmount * 100 - amountCents) > 0.001) {
    return { code: -1, msg: '提现金额最多两位小数' }
  }
  const finalAmount = amountCents / 100

  if (finalAmount < 10) {
    return { code: -1, msg: '最低提现金额为 ¥10' }
  }
  if (!partnerTradeNo) {
    return { code: -1, msg: '交易号不能为空' }
  }

  const financeRes = await db.collection('finance').where({ openid }).get()
  if (financeRes.data.length === 0) {
    return { code: -1, msg: '财务信息不存在' }
  }
  const finance = financeRes.data[0]

  // 事务：校验余额 + 幂等（同一交易号不重复），并先行扣款占位
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
      if (dup.status === 'completed') return { code: 0, msg: '该提现已完成，请勿重复提交' }
      if (dup.status === 'failed') return { code: -1, msg: '该提现申请已失败，请重新发起' }
      // 处理中：查询真实转账状态并落定，避免重复提交
      const finalized = await finalizeProcessing(finance._id, partnerTradeNo)
      if (finalized === 'completed') return { code: 0, msg: '该提现已完成，请勿重复提交' }
      if (finalized === 'failed') return { code: -1, msg: '该提现申请已失败，请重新发起' }
      return { code: -1, msg: '该提现申请处理中，请勿重复提交' }
    }

    const newRecords = [...(current.withdrawRecords || []), {
      amount: finalAmount,
      partnerTradeNo,
      realName: realName || '',
      remark: remark || '',
      status: 'processing',
      source: 'auto',
      createTime: new Date()
    }]

    await transaction.collection('finance').doc(finance._id).update({
      data: {
        availableAmount: (current.availableAmount || 0) - finalAmount,
        withdrawAmount: (current.withdrawAmount || 0) + finalAmount,
        withdrawRecords: newRecords,
        updateTime: new Date()
      }
    })

    await transaction.commit()
  } catch (e) {
    try { await transaction.rollback() } catch (e2) { /* 已回滚 */ }
    console.error('提现事务失败:', e)
    return { code: -1, msg: '提现申请失败，请重试' }
  }

  // 事务已占用余额，此时执行真实转账
  try {
    const result = await cloud.cloudPay.transfer({
      partnerTradeNo,
      openid,
      amount: amountCents,
      desc: remark || '互助酬金提现',
      checkName: 'FORCE_CHECK',
      reUserName: realName
    })

    await markCompleted(finance._id, partnerTradeNo, result)

    return { code: 0, data: result, msg: '提现成功' }
  } catch (error) {
    console.error('企业转账失败:', error)
    // 先核实微信侧真实状态：避免“转账其实成功但返回报错”导致退款造成双重到账
    let transferred = false
    let transferStatus = ''
    try {
      const q = await cloud.cloudPay.queryTransfer({ partnerTradeNo })
      transferStatus = (q && q.status) || ''
      // 只有微信侧明确返回 SUCCESS 才算转出成功；PROCESSING 不算
      transferred = transferStatus === 'SUCCESS'
    } catch (e) {
      console.error('查询转账状态失败:', e.message || e)
    }

    if (transferred) {
      await markCompleted(finance._id, partnerTradeNo, {})
      return { code: 0, data: {}, msg: '提现成功' }
    }

    // 明确失败才退回余额；处理中/查询失败时保留记录，等待用户稍后重试确认
    if (transferStatus === 'FAILED' || transferStatus === 'FAIL') {
      await refundAndMarkFailed(finance._id, partnerTradeNo, finalAmount, error.message)
      return { code: -1, msg: error.message }
    }

    return { code: -1, msg: '转账结果确认中，请稍后重试' }
  }
}

// 查询处理中记录的最终状态：已完成 / 已失败 / 仍在处理
async function finalizeProcessing(financeId, partnerTradeNo) {
  try {
    const q = await cloud.cloudPay.queryTransfer({ partnerTradeNo })
    const status = (q && q.status) || ''
    if (status === 'SUCCESS') {
      await markCompleted(financeId, partnerTradeNo, q)
      return 'completed'
    }
    if (status === 'FAIL' || status === 'FAILED') {
      // 读取记录金额，将占用的余额退回
      const res = await db.collection('finance').doc(financeId).get()
      const record = (res.data && res.data.withdrawRecords || []).find(r => r.partnerTradeNo === partnerTradeNo)
      await refundAndMarkFailed(financeId, partnerTradeNo, record ? record.amount : 0, '转账失败')
      return 'failed'
    }
    return 'processing'
  } catch (e) {
    console.error('查询处理中提现失败:', e.message || e)
    return 'processing'
  }
}

// 把指定交易号的提现记录标记为已完成
async function markCompleted(financeId, partnerTradeNo, result) {
  const res = await db.collection('finance').doc(financeId).get()
  if (!res.data) return
  const records = (res.data.withdrawRecords || []).map(r =>
    r.partnerTradeNo === partnerTradeNo
      ? { ...r, status: 'completed', result, processedAt: new Date() }
      : r
  )
  await db.collection('finance').doc(financeId).update({
    data: { withdrawRecords: records, updateTime: new Date() }
  })
}

// 转账失败：退回余额并标记记录为失败
async function refundAndMarkFailed(financeId, partnerTradeNo, amount, errorMsg) {
  const res = await db.collection('finance').doc(financeId).get()
  if (!res.data) return
  const records = (res.data.withdrawRecords || []).map(r =>
    r.partnerTradeNo === partnerTradeNo
      ? { ...r, status: 'failed', error: errorMsg, processedAt: new Date() }
      : r
  )
  await db.collection('finance').doc(financeId).update({
    data: {
      availableAmount: _.inc(amount),
      withdrawAmount: _.inc(-amount),
      withdrawRecords: records,
      updateTime: new Date()
    }
  })
}

async function queryTransfer({ partnerTradeNo }) {
  const result = await cloud.cloudPay.queryTransfer({
    partnerTradeNo
  })
  return { code: 0, data: result }
}
