const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()
const _ = db.command

// 管理员 openid 列表 - 兜底白名单。
// 优先从 config 集合的 admin 文档（{ _id: 'admin', openidList: ['openid', ...] }）读取，
// 两者都为空时所有请求都会被拒绝。
// 测试前请把你的 openid 填到这里，或在云开发控制台 config 集合建 admin 文档。
const ADMIN_LIST = []

// 校验调用者是否为管理员
async function isAdmin(openid) {
  if (!openid) return false
  if (ADMIN_LIST.includes(openid)) return true
  try {
    const adminDoc = await db.collection('config').doc('admin').get()
    const list = adminDoc.data && adminDoc.data.openidList
    return Array.isArray(list) && list.includes(openid)
  } catch (e) {
    return false
  }
}

// 分批拉取全部数据，绕开单次 100 条上限
async function getAll(query) {
  const MAX = 100
  const list = []
  let skip = 0
  while (true) {
    const res = await query.skip(skip).limit(MAX).get()
    list.push(...res.data)
    if (res.data.length < MAX) break
    skip += MAX
  }
  return list
}

// 把 'YYYY-MM-DD' 解析为本地时区当天零点（避免 new Date(str) 的 UTC 偏移）
function parseLocalDate(str) {
  const parts = String(str).split('-').map(Number)
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1)
}

// 互助子类型统一归入 help 分类，用于商家端统计/筛选
function normalizeOrderType(type) {
  return ['carpool', 'express', 'partner', 'other'].includes(type) ? 'help' : (type || 'other')
}

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    // 鉴权：所有操作都必须来自管理员
    if (!(await isAdmin(OPENID))) {
      return { code: -1, msg: '无权限访问管理端' }
    }

    switch (action) {
      case 'checkAdmin':
        return { code: 0, isAdmin: true }
      case 'getDashboard':
        return await getDashboard(data)
      case 'getOrders':
        return await getOrders(data)
      case 'getOrderDetail':
        return await getOrderDetail(data)
      case 'createOrder':
        return await createOrder(data)
      case 'updateOrder':
        return await updateOrder(data)
      case 'deleteOrder':
        return await deleteOrder(data)
      case 'getFinanceOverview':
        return await getFinanceOverview(data)
      case 'getWithdrawList':
        return await getWithdrawList(data)
      case 'processWithdraw':
        return await processWithdraw(data)
      case 'getUserList':
        return await getUserList(data)
      case 'getCategoryStats':
        return await getCategoryStats(data)
      case 'getRecentTransactions':
        return await getRecentTransactions(data)
      case 'getDailyStats':
        return await getDailyStats(data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('admin云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}

// ============ 仪表盘 ============

async function getDashboard(data) {
  const { startDate, endDate } = data || {}

  // 默认查询全部历史数据，传入日期则按日期筛选
  let dateFilter = null
  if (startDate || endDate) {
    const now = new Date()
    let end = endDate
      ? parseLocalDate(endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    if (endDate) {
      // 结束日期取当天最后一秒（本地时区）
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
    }
    dateFilter = {
      start: startDate ? parseLocalDate(startDate) : new Date(now.getFullYear(), now.getMonth(), 1),
      end
    }
  }

  // 并行查询各项数据
  const [
    orderStats,
    financeStats,
    userCount,
    todayOrders,
    pendingWithdraws,
    pendingWithdrawAmount,
    payments
  ] = await Promise.all([
    getOrderStats(dateFilter),
    getFinanceStats(),
    getTotalUserCount(),
    getTodayOrderCount(),
    getPendingWithdrawCount(),
    getPendingWithdrawAmount(),
    getPaymentStats(dateFilter)
  ])

  return {
    code: 0,
    data: {
      // 核心指标
      totalRevenue: financeStats.totalRevenue || 0,           // 总交易额
      platformCommission: financeStats.totalCommission || 0,   // 平台抽成
      totalOrders: orderStats.total || 0,                      // 总订单数
      completedOrders: orderStats.completed || 0,              // 已完成订单
      cancelledOrders: orderStats.cancelled || 0,              // 已取消订单
      userCount: userCount || 0,                                // 总用户数
      todayOrders: todayOrders || 0,                            // 今日订单
      pendingWithdraws: pendingWithdraws || 0,                  // 待处理提现
      pendingWithdrawAmount: pendingWithdrawAmount || 0,         // 待处理提现金额

      // 分类统计
      categoryBreakdown: orderStats.categoryBreakdown || {},

      // 支付统计
      paymentStats: payments || {},

      // 时间范围
      period: dateFilter || { start: null, end: null, allTime: true }
    }
  }
}

async function getOrderStats(dateFilter) {
  try {
    // dateFilter 为 null 时查询全部订单
    let query = db.collection('orders')
    if (dateFilter) {
      query = query.where({
        createTime: _.gte(dateFilter.start).and(_.lte(dateFilter.end))
      })
    }
    const orders = await getAll(query)

    const stats = {
      total: orders.length,
      completed: 0,
      cancelled: 0,
      pending: 0,
      paid: 0,
      confirmed: 0,
      totalAmount: 0,
      categoryBreakdown: {
        market: { count: 0, amount: 0 },
        lostfound: { count: 0, amount: 0 },
        help: { count: 0, amount: 0 },
        other: { count: 0, amount: 0 }
      }
    }

    orders.forEach(order => {
      // 状态统计
      const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed'
      if (isPaid || order.orderStatus === 'completed') {
        stats.completed++
      } else if (order.orderStatus === 'cancelled') {
        stats.cancelled++
      } else {
        stats.pending++
      }

      switch (order.paymentStatus) {
        case 'paid': stats.paid++; break
        case 'confirmed': stats.confirmed++; break
      }

      // 金额统计（只算已支付和已确认的）
      if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') {
        stats.totalAmount += order.amount || 0
      }

      // 分类统计（互助子类型统一归入 help）
      const cat = normalizeOrderType(order.type)
      if (stats.categoryBreakdown[cat]) {
        stats.categoryBreakdown[cat].count++
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') {
          stats.categoryBreakdown[cat].amount += order.amount || 0
        }
      } else {
        stats.categoryBreakdown.other.count++
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'confirmed') {
          stats.categoryBreakdown.other.amount += order.amount || 0
        }
      }
    })

    return stats
  } catch (e) {
    console.error('getOrderStats error:', e)
    return { total: 0, completed: 0, cancelled: 0, pending: 0, paid: 0, confirmed: 0, totalAmount: 0, categoryBreakdown: {} }
  }
}

async function getFinanceStats() {
  try {
    const financeList = await getAll(db.collection('finance'))

    let totalRevenue = 0
    let totalCommission = 0
    let availableAmount = 0
    let withdrawAmount = 0
    let totalWithdrawRecords = 0

    financeList.forEach(f => {
      totalCommission += f.totalCommission || 0
      availableAmount += f.availableAmount || 0
      withdrawAmount += f.withdrawAmount || 0
      totalWithdrawRecords += (f.withdrawRecords || []).length
      // totalRevenue = 佣金 + 可用余额 + 已提现 = 所有通过平台的金额
      totalRevenue += (f.totalCommission || 0) + (f.availableAmount || 0) + (f.withdrawAmount || 0)
    })

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      availableAmount: Math.round(availableAmount * 100) / 100,
      withdrawAmount: Math.round(withdrawAmount * 100) / 100,
      userCount: financeList.length,
      totalWithdrawRecords
    }
  } catch (e) {
    console.error('getFinanceStats error:', e)
    return { totalRevenue: 0, totalCommission: 0, availableAmount: 0, withdrawAmount: 0, userCount: 0 }
  }
}

async function getTotalUserCount() {
  try {
    const res = await db.collection('users').count()
    return res.total || 0
  } catch (e) {
    // 尝试 student 表
    try {
      const res = await db.collection('student').count()
      return res.total || 0
    } catch (e2) {
      return 0
    }
  }
}

async function getTodayOrderCount() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const res = await db.collection('orders')
      .where({
        createTime: _.gte(today).and(_.lt(tomorrow))
      })
      .count()
    return res.total || 0
  } catch (e) {
    return 0
  }
}

async function getPendingWithdrawCount() {
  try {
    const financeList = await getAll(db.collection('finance'))
    let count = 0
    financeList.forEach(f => {
      const pending = (f.withdrawRecords || []).filter(r => r.status === 'pending')
      count += pending.length
    })
    return count
  } catch (e) {
    return 0
  }
}

async function getPaymentStats(dateFilter) {
  try {
    let query = db.collection('payments')
    if (dateFilter) {
      query = query.where({
        createTime: _.gte(dateFilter.start).and(_.lte(dateFilter.end))
      })
    }
    const payments = await getAll(query)

    let totalAmount = 0
    let successCount = 0
    let pendingCount = 0

    payments.forEach(p => {
      if (p.status === 'paid' || p.status === 'success') {
        successCount++
        totalAmount += p.amount || 0
      }
      else if (p.status === 'pending') pendingCount++
    })

    return {
      totalPayments: payments.length,
      successCount,
      pendingCount,
      totalAmount: Math.round(totalAmount * 100) / 100
    }
  } catch (e) {
    return { totalPayments: 0, successCount: 0, pendingCount: 0, totalAmount: 0 }
  }
}

// ============ 订单管理 ============

async function getOrders(data) {
  const {
    page = 1,
    pageSize = 20,
    type,           // market, lostfound, help, 或空=全部
    paymentStatus,  // pending, paid, confirmed
    orderStatus,    // pending, completed, cancelled
    keyword,
    startDate,
    endDate
  } = data

  const where = {}

  if (type && type !== 'all') {
    where.type = type === 'help' ? _.in(['carpool', 'express', 'partner', 'other']) : type
  }

  if (paymentStatus && paymentStatus !== 'all') {
    where.paymentStatus = paymentStatus
  }

  if (orderStatus && orderStatus !== 'all') {
    where.orderStatus = orderStatus
  }

  // 日期筛选
  if (startDate || endDate) {
    const dateFilter = {}
    if (startDate) dateFilter.$gte = parseLocalDate(startDate)
    if (endDate) {
      const end = parseLocalDate(endDate)
      dateFilter.$lte = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
    }
    if (Object.keys(dateFilter).length > 0) {
      where.createTime = dateFilter
    }
  }

  // 关键词搜索（匹配买卖家昵称）
  if (keyword) {
    where.$or = [
      { buyerNickName: db.RegExp({ regexp: keyword, options: 'i' }) },
      { sellerNickName: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]
  }

  try {
    const [ordersRes, countRes] = await Promise.all([
      db.collection('orders')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      db.collection('orders').where(where).count()
    ])

    return {
      code: 0,
      data: {
        list: ordersRes.data,
        total: countRes.total,
        page,
        pageSize,
        totalPages: Math.ceil(countRes.total / pageSize)
      }
    }
  } catch (e) {
    console.error('getOrders error:', e)
    return { code: -1, msg: e.message }
  }
}

async function getOrderDetail(data) {
  const { orderId } = data
  try {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.data) {
      return { code: -1, msg: '订单不存在' }
    }
    return { code: 0, data: order.data }
  } catch (e) {
    return { code: -1, msg: e.message }
  }
}

async function getPendingWithdrawAmount() {
  try {
    const financeList = await getAll(db.collection('finance'))
    let total = 0
    financeList.forEach(f => {
      (f.withdrawRecords || []).forEach(r => {
        if (r.status === 'pending') total += r.amount || 0
      })
    })
    return Math.round(total * 100) / 100
  } catch (e) {
    return 0
  }
}

// ============ 订单管理（增删改） ============

const ORDER_TYPES = ['market', 'lostfound', 'help', 'carpool', 'express', 'partner', 'other']
const PAYMENT_STATUSES = ['pending', 'paid', 'confirmed']
const ORDER_STATUSES = ['pending', 'completed', 'cancelled']

// 金额校验：合法正数且最多两位小数
function isValidAmount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return false
  return Math.abs(num * 100 - Math.round(num * 100)) <= 0.001
}

async function createOrder(data) {
  const { type, amount, buyerNickName, sellerNickName, paymentStatus = 'paid', orderStatus, remark } = data || {}

  if (!ORDER_TYPES.includes(type)) {
    return { code: -1, msg: '无效的订单类型' }
  }
  if (!isValidAmount(amount)) {
    return { code: -1, msg: '订单金额必须是大于 0 且最多两位小数的金额' }
  }
  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    return { code: -1, msg: '无效的支付状态' }
  }

  // 已支付订单统一视为已完成，与支付回调口径一致
  const isPaid = paymentStatus === 'paid' || paymentStatus === 'confirmed'
  const finalOrderStatus = isPaid
    ? 'completed'
    : (ORDER_STATUSES.includes(orderStatus) ? orderStatus : 'pending')

  const result = await db.collection('orders').add({
    data: {
      type,
      itemId: '',
      buyerOpenid: '',
      sellerOpenid: '',
      buyerNickName: buyerNickName || '',
      sellerNickName: sellerNickName || '',
      amount: Number(amount),
      commission: 0,
      sellerAmount: 0,
      paymentStatus,
      orderStatus: finalOrderStatus,
      outTradeNo: `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      remark: remark || '',
      createTime: db.serverDate(),
      payTime: isPaid ? db.serverDate() : null
    }
  })

  return { code: 0, msg: '订单创建成功', data: result._id }
}

async function updateOrder(data) {
  const { orderId, type, amount, buyerNickName, sellerNickName, paymentStatus, orderStatus, remark } = data || {}
  if (!orderId) {
    return { code: -1, msg: '缺少订单ID' }
  }

  let order
  try {
    order = await db.collection('orders').doc(orderId).get()
    if (!order.data) {
      return { code: -1, msg: '订单不存在' }
    }
  } catch (e) {
    return { code: -1, msg: '订单不存在' }
  }

  const clean = {}
  if (type !== undefined) {
    if (!ORDER_TYPES.includes(type)) return { code: -1, msg: '无效的订单类型' }
    clean.type = type
  }
  if (amount !== undefined) {
    if (!isValidAmount(amount)) return { code: -1, msg: '订单金额必须是大于 0 且最多两位小数的金额' }
    clean.amount = Number(amount)
  }
  if (buyerNickName !== undefined) clean.buyerNickName = buyerNickName
  if (sellerNickName !== undefined) clean.sellerNickName = sellerNickName
  if (paymentStatus !== undefined) {
    if (!PAYMENT_STATUSES.includes(paymentStatus)) return { code: -1, msg: '无效的支付状态' }
    clean.paymentStatus = paymentStatus
    if (paymentStatus === 'paid' || paymentStatus === 'confirmed') {
      clean.orderStatus = 'completed'
      clean.payTime = db.serverDate()
    }
  }
  if (orderStatus !== undefined) {
    if (!ORDER_STATUSES.includes(orderStatus)) return { code: -1, msg: '无效的订单状态' }
    const currentPayment = paymentStatus !== undefined ? paymentStatus : order.data.paymentStatus
    if ((currentPayment === 'paid' || currentPayment === 'confirmed') && orderStatus !== 'completed') {
      return { code: -1, msg: '已支付订单状态只能是已完成' }
    }
    clean.orderStatus = orderStatus
  }
  if (remark !== undefined) clean.remark = remark
  clean.updateTime = db.serverDate()

  await db.collection('orders').doc(orderId).update({ data: clean })
  return { code: 0, msg: '订单更新成功' }
}

async function deleteOrder(data) {
  const { orderId } = data || {}
  if (!orderId) {
    return { code: -1, msg: '缺少订单ID' }
  }

  try {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.data) {
      return { code: -1, msg: '订单不存在' }
    }
    await db.collection('orders').doc(orderId).remove()
    return { code: 0, msg: '订单已删除' }
  } catch (e) {
    console.error('删除订单失败:', e)
    return { code: -1, msg: e.message }
  }
}

// ============ 财务管理 ============

async function getFinanceOverview(data) {
  const { startDate, endDate } = data || {}
  const now = new Date()
  let start = startDate ? parseLocalDate(startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
  let end = endDate ? parseLocalDate(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  if (endDate) {
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
  }

  try {
    // 获取所有财务记录
    const financeList = await getAll(db.collection('finance'))

    let totalRevenue = 0       // 平台总流水（卖家收入+佣金）
    let totalCommission = 0    // 平台总佣金
    let availableBalance = 0   // 用户可用余额（未提现）
    let withdrawnTotal = 0     // 已提现总额
    let pendingWithdraw = 0    // 待处理提现

    const allWithdraws = []
    const userFinanceDetails = []

    financeList.forEach(f => {
      totalCommission += f.totalCommission || 0
      availableBalance += f.availableAmount || 0
      withdrawnTotal += f.withdrawAmount || 0

      const records = f.withdrawRecords || []
      records.forEach(r => {
        allWithdraws.push({
          ...r,
          openid: f.openid,
          stuId: f.stuId || ''
        })
        if (r.status === 'pending') {
          pendingWithdraw += r.amount || 0
        }
      })

      userFinanceDetails.push({
        openid: f.openid,
        stuId: f.stuId || '',
        totalCommission: f.totalCommission || 0,
        availableAmount: f.availableAmount || 0,
        withdrawAmount: f.withdrawAmount || 0,
        recordCount: records.length
      })
    })

    totalRevenue = totalCommission + availableBalance + withdrawnTotal

    // 时间段内的订单统计
    const orders = await getAll(db.collection('orders')
      .where({
        createTime: _.gte(start).and(_.lte(end)),
        paymentStatus: _.in(['paid', 'confirmed'])
      }))

    let periodRevenue = 0
    let periodCommission = 0
    orders.forEach(o => {
      periodRevenue += o.amount || 0
      periodCommission += o.commission || 0
    })

    return {
      code: 0,
      data: {
        overview: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCommission: Math.round(totalCommission * 100) / 100,
          availableBalance: Math.round(availableBalance * 100) / 100,
          withdrawnTotal: Math.round(withdrawnTotal * 100) / 100,
          pendingWithdraw: Math.round(pendingWithdraw * 100) / 100,
          platformProfitRate: totalRevenue > 0 ? Math.round((totalCommission / totalRevenue) * 10000) / 100 : 0
        },
        period: {
          start, end,
          revenue: Math.round(periodRevenue * 100) / 100,
          commission: Math.round(periodCommission * 100) / 100,
          orderCount: orders.length
        },
        userFinanceDetails,
        recentWithdraws: allWithdraws
          .sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
          .slice(0, 50)
      }
    }
  } catch (e) {
    console.error('getFinanceOverview error:', e)
    return { code: -1, msg: e.message }
  }
}

async function getWithdrawList(data) {
  const { status, page = 1, pageSize = 20 } = data || {}

  try {
    const financeList = await getAll(db.collection('finance'))
    let allRecords = []

    financeList.forEach(f => {
      const records = f.withdrawRecords || []
      records.forEach(r => {
        allRecords.push({
          ...r,
          openid: f.openid,
          stuId: f.stuId || '',
          financeId: f._id
        })
      })
    })

    // 筛选状态
    if (status && status !== 'all') {
      allRecords = allRecords.filter(r => r.status === status)
    }

    // 按时间倒序
    allRecords.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))

    const total = allRecords.length
    const start = (page - 1) * pageSize
    const list = allRecords.slice(start, start + pageSize)

    return {
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  } catch (e) {
    console.error('getWithdrawList error:', e)
    return { code: -1, msg: e.message }
  }
}

async function processWithdraw(data) {
  const { financeId, partnerTradeNo, action: processAction, remark } = data

  if (!financeId || !partnerTradeNo) {
    return { code: -1, msg: '参数不完整' }
  }

  try {
    const finance = await db.collection('finance').doc(financeId).get()
    if (!finance.data) {
      return { code: -1, msg: '财务记录不存在' }
    }

    const records = finance.data.withdrawRecords || []
    const idx = records.findIndex(r => r.partnerTradeNo === partnerTradeNo)
    if (idx === -1) {
      return { code: -1, msg: '提现记录不存在' }
    }

    const record = records[idx]

    // 系统自动转账的提现记录：不允许盲批/盲拒，但提供“核实落定”兜底
    if (record.source === 'auto') {
      if (record.status !== 'processing') {
        return { code: -1, msg: '该提现已由系统自动处理' }
      }
      return await verifyAutoWithdraw(finance, idx, record)
    }

    const newStatus = processAction === 'approve' ? 'completed' : 'failed'

    records[idx] = {
      ...record,
      status: newStatus,
      processedAt: db.serverDate(),
      remark: remark || ''
    }

    // 如果是拒绝，退回金额
    const updateData = {
      withdrawRecords: records,
      updateTime: db.serverDate()
    }

    if (processAction === 'reject' && record.status === 'pending') {
      updateData.availableAmount = _.inc(record.amount)
      updateData.withdrawAmount = _.inc(-record.amount)
    }

    await db.collection('finance').doc(financeId).update({ data: updateData })

    return { code: 0, msg: processAction === 'approve' ? '已批准提现' : '已拒绝提现' }
  } catch (e) {
    console.error('processWithdraw error:', e)
    return { code: -1, msg: e.message }
  }
}

// 核实系统自动提现的真实状态并落定（解决转账结果查询失败导致记录卡在“处理中”的问题）
async function verifyAutoWithdraw(finance, idx, record) {
  try {
    const q = await cloud.cloudPay.queryTransfer({ partnerTradeNo: record.partnerTradeNo })
    const status = (q && q.status) || ''
    const records = finance.data.withdrawRecords || []

    if (status === 'SUCCESS') {
      records[idx] = {
        ...record,
        status: 'completed',
        result: q,
        processedAt: db.serverDate(),
        remark: '系统核实转账成功'
      }
      await db.collection('finance').doc(finance._id).update({
        data: { withdrawRecords: records, updateTime: db.serverDate() }
      })
      return { code: 0, msg: '已核实：转账成功，提现完成' }
    }

    if (status === 'FAILED' || status === 'FAIL') {
      records[idx] = {
        ...record,
        status: 'failed',
        error: (q && q.reason) || '转账失败',
        processedAt: db.serverDate(),
        remark: '系统核实转账失败'
      }
      await db.collection('finance').doc(finance._id).update({
        data: {
          withdrawRecords: records,
          availableAmount: _.inc(record.amount || 0),
          withdrawAmount: _.inc(-(record.amount || 0)),
          updateTime: db.serverDate()
        }
      })
      return { code: 0, msg: '已核实：转账失败，金额已退回用户余额' }
    }

    return { code: -1, msg: '转账仍在处理中，请稍后再试' }
  } catch (e) {
    console.error('核实自动提现失败:', e)
    return { code: -1, msg: '查询转账状态失败，请稍后再试' }
  }
}

// ============ 用户管理 ============

async function getUserList(data) {
  const { page = 1, pageSize = 20, keyword } = data || {}

  try {
    // 以 users 表为主（微信登录 + 手机号），student 仅作学号补充
    const [users, students, financeList] = await Promise.all([
      getAll(db.collection('users')).catch(() => []),
      getAll(db.collection('student')).catch(() => []),
      getAll(db.collection('finance')).catch(() => [])
    ])

    // 合并用户信息
    const studentMap = {}
    students.forEach(s => {
      if (s.openid) studentMap[s.openid] = s.stuId || ''
    })

    const financeMap = {}
    financeList.forEach(f => {
      financeMap[f.openid || f.stuId] = {
        totalCommission: f.totalCommission || 0,
        availableAmount: f.availableAmount || 0,
        withdrawAmount: f.withdrawAmount || 0,
        withdrawCount: (f.withdrawRecords || []).length
      }
    })

    const allUsers = users.map(u => ({
      openid: u.openid || '',
      stuId: studentMap[u.openid] || u.stuId || '',
      phone: u.phone || '',
      avatarUrl: u.avatarUrl || '',
      nickName: u.nickName || '',
      createTime: u.createTime || '',
      ...(financeMap[u.openid || u.stuId] || {})
    }))

    // 关键词过滤
    if (keyword) {
      const kw = keyword.toLowerCase()
      allUsers = allUsers.filter(u =>
        (u.stuId && u.stuId.includes(kw)) ||
        (u.phone && u.phone.includes(kw)) ||
        (u.nickName && u.nickName.toLowerCase().includes(kw))
      )
    }

    allUsers.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))

    const total = allUsers.length
    const start = (page - 1) * pageSize
    const list = allUsers.slice(start, start + pageSize)

    return {
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  } catch (e) {
    console.error('getUserList error:', e)
    return { code: -1, msg: e.message }
  }
}

// ============ 分类统计 ============

async function getCategoryStats(data) {
  const { startDate, endDate } = data || {}
  const now = new Date()
  let start = startDate ? parseLocalDate(startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
  let end = endDate ? parseLocalDate(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  if (endDate) {
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
  }

  try {
    const orders = await getAll(db.collection('orders')
      .where({
        createTime: _.gte(start).and(_.lte(end))
      }))

    const categories = {
      market: { name: '二手市场', count: 0, amount: 0, commission: 0, paid: 0, pending: 0 },
      lostfound: { name: '失物招领', count: 0, amount: 0, commission: 0, paid: 0, pending: 0 },
      help: { name: '校园互助', count: 0, amount: 0, commission: 0, paid: 0, pending: 0 }
    }

    orders.forEach(o => {
      const cat = categories[normalizeOrderType(o.type)]
      if (cat) {
        cat.count++
        if (o.paymentStatus === 'paid' || o.paymentStatus === 'confirmed') {
          cat.amount += o.amount || 0
          cat.commission += o.commission || 0
          cat.paid++
        } else if (o.paymentStatus === 'pending') {
          cat.pending++
        }
      }
    })

    // 格式化金额
    Object.keys(categories).forEach(k => {
      categories[k].amount = Math.round(categories[k].amount * 100) / 100
      categories[k].commission = Math.round(categories[k].commission * 100) / 100
    })

    return {
      code: 0,
      data: {
        categories,
        period: { start, end },
        totalOrders: orders.length
      }
    }
  } catch (e) {
    console.error('getCategoryStats error:', e)
    return { code: -1, msg: e.message }
  }
}

// ============ 最近交易 ============

async function getRecentTransactions(data) {
  const { limit = 10 } = data || {}

  try {
    const orders = await db.collection('orders')
      .where({
        paymentStatus: _.in(['paid', 'confirmed'])
      })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    return {
      code: 0,
      data: orders.data.map(o => ({
        id: o._id,
        type: o.type,
        amount: o.amount,
        buyer: o.buyerNickName || '匿名',
        seller: o.sellerNickName || '匿名',
        status: o.paymentStatus,
        time: o.createTime
      }))
    }
  } catch (e) {
    return { code: -1, msg: e.message }
  }
}

// ============ 每日统计（近30天） ============

async function getDailyStats(data) {
  const { days = 30 } = data || {}

  try {
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    const orders = await getAll(db.collection('orders')
      .where({
        createTime: _.gte(startDate),
        paymentStatus: _.in(['paid', 'confirmed'])
      })
      .orderBy('createTime', 'asc'))

    // 按日期分组
    const dailyMap = {}
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dailyMap[key] = { date: key, orderCount: 0, amount: 0, commission: 0 }
    }

    orders.forEach(o => {
      const d = new Date(o.createTime)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (dailyMap[key]) {
        dailyMap[key].orderCount++
        dailyMap[key].amount += o.amount || 0
        dailyMap[key].commission += o.commission || 0
      }
    })

    const dailyList = Object.values(dailyMap).map(d => ({
      ...d,
      amount: Math.round(d.amount * 100) / 100,
      commission: Math.round(d.commission * 100) / 100
    }))

    return { code: 0, data: dailyList }
  } catch (e) {
    console.error('getDailyStats error:', e)
    return { code: -1, msg: e.message }
  }
}
