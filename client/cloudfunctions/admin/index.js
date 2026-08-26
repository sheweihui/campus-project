const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()
const _ = db.command
const BUILTIN_ADMIN_OPENIDS = [
  '698a4c596a6b6efe017045e41894fbb8'
]
const BUILTIN_ADMIN_PHONES = [
  '13276057867',
  '15940995665'
]

function getEnvAdminOpenids() {
  return (process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map(openid => openid.trim())
    .filter(Boolean)
}

async function isAdmin(openid) {
  if (!openid) return false
  if (BUILTIN_ADMIN_OPENIDS.includes(openid)) return true
  const envOpenids = getEnvAdminOpenids()
  if (envOpenids.includes(openid)) return true

  try {
    const userRes = await db.collection('users')
      .where({ openid })
      .field({ phone: true })
      .get()
    const phone = userRes.data && userRes.data[0] && userRes.data[0].phone
    if (BUILTIN_ADMIN_PHONES.includes(String(phone || ''))) return true
  } catch (e) {
    console.error('查询管理员手机号失败:', e)
  }

  try {
    const adminDoc = await db.collection('config').doc('admin').get()
    const list = adminDoc.data && (adminDoc.data.openidList || adminDoc.data.openids)
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

function normalizePaymentOrderStatus(status) {
  if (status === 'cancelled' || status === 'failed') return 'cancelled'
  if (status === 'paid' || status === 'confirmed' || status === 'success' || status === 'prepaid') return 'completed'
  return 'pending'
}

function normalizePaymentStatus(status) {
  if (status === 'success' || status === 'prepaid') return 'paid'
  if (status === 'confirmed') return 'confirmed'
  return status || 'pending'
}

function marketToPaymentStatus(status) {
  if (status === 'sold') return 'paid'
  if (status === 'off') return 'cancelled'
  return 'pending'
}

function marketToOrderStatus(status) {
  if (status === 'sold') return 'completed'
  if (status === 'off') return 'cancelled'
  return 'pending'
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
      case 'sendUserMessage':
        return await sendUserMessage(data)
      case 'broadcastMessage':
        return await broadcastMessage(data)
      case 'listPosts':
        return await listPosts(data)
      case 'updatePost':
        return await updatePost(data)
      case 'deletePost':
        return await deletePost(data)
      case 'remarkPost':
        return await remarkPost(data)
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
    payments,
    todayStats,
    postStats
  ] = await Promise.all([
    getOrderStats(dateFilter),
    getFinanceStats(),
    getTotalUserCount(),
    getTodayOrderCount(),
    getPendingWithdrawCount(),
    getPendingWithdrawAmount(),
    getPaymentStats(dateFilter),
    getTodayStats(),
    getPostStats()
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
      todayAmount: todayStats.todayAmount || 0,                 // 今日交易额
      todayCommission: todayStats.todayCommission || 0,         // 今日佣金
      pendingWithdraws: pendingWithdraws || 0,                  // 待处理提现
      pendingWithdrawAmount: pendingWithdrawAmount || 0,         // 待处理提现金额

      // 分类统计
      categoryBreakdown: orderStats.categoryBreakdown || {},
      postStats: postStats || {},

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

async function getPostStats() {
  try {
    const [
      marketCount,
      lostfoundCount,
      carpoolCount,
      expressCount,
      partnerCount,
      otherCount
    ] = await Promise.all([
      db.collection('market').count().then(res => res.total).catch(() => 0),
      db.collection('lostfound').count().then(res => res.total).catch(() => 0),
      db.collection('help-carpool').count().then(res => res.total).catch(() => 0),
      db.collection('help-express').count().then(res => res.total).catch(() => 0),
      db.collection('help-partner').count().then(res => res.total).catch(() => 0),
      db.collection('help-other').count().then(res => res.total).catch(() => 0)
    ])

    return {
      market: { count: marketCount },
      lostfound: { count: lostfoundCount },
      help: { count: carpoolCount + expressCount + partnerCount + otherCount }
    }
  } catch (e) {
    console.error('getPostStats error:', e)
    return {
      market: { count: 0 },
      lostfound: { count: 0 },
      help: { count: 0 }
    }
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

// 今日已支付订单的交易额与佣金（用于商家端概览）
async function getTodayStats() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const res = await db.collection('orders')
      .where({
        createTime: _.gte(today).and(_.lt(tomorrow)),
        paymentStatus: _.in(['paid', 'confirmed'])
      })
      .limit(100)
      .get()

    let amount = 0
    let commission = 0
    res.data.forEach(o => {
      amount += o.amount || 0
      commission += o.commission || 0
    })
    return {
      todayAmount: Math.round(amount * 100) / 100,
      todayCommission: Math.round(commission * 100) / 100
    }
  } catch (e) {
    console.error('getTodayStats error:', e)
    return { todayAmount: 0, todayCommission: 0 }
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
      if (p.status === 'paid' || p.status === 'success' || p.status === 'prepaid') {
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
    const orders = await getAll(db.collection('orders')
      .where(where)
      .field({
        _id: true,
        type: true,
        itemId: true,
        buyerOpenid: true,
        sellerOpenid: true,
        buyerNickName: true,
        sellerNickName: true,
        amount: true,
        commission: true,
        sellerAmount: true,
        paymentStatus: true,
        orderStatus: true,
        outTradeNo: true,
        createTime: true,
        payTime: true,
        completeTime: true
      })
      .orderBy('createTime', 'desc')).catch(error => {
        console.error('getOrders orders query failed:', error)
        return []
      })

    let paymentWhere = {}
    if (type && type !== 'all') {
      paymentWhere.itemType = type === 'help' ? _.in(['carpool', 'express', 'partner', 'other']) : type
    }
    if (paymentStatus && paymentStatus !== 'all') {
      paymentWhere.status = paymentStatus === 'paid' ? _.in(['paid', 'success', 'prepaid']) : paymentStatus
    }
    if (where.createTime) {
      paymentWhere.createTime = where.createTime
    }

    let payments = []
    if (!keyword) {
      payments = await getAll(db.collection('payments')
        .where(paymentWhere)
        .field({
          _id: true,
          outTradeNo: true,
          itemType: true,
          type: true,
          itemId: true,
          buyerOpenid: true,
          amount: true,
          status: true,
          createTime: true,
          payTime: true
        })
        .orderBy('createTime', 'desc')).catch(error => {
          console.error('getOrders payments query failed:', error)
          return []
        })
    }

    const orderTradeNos = new Set(orders.map(order => order.outTradeNo).filter(Boolean))
    const paymentOrders = payments
      .filter(payment => !payment.outTradeNo || !orderTradeNos.has(payment.outTradeNo))
      .map(payment => ({
        _id: `pay_${payment._id}`,
        type: normalizeOrderType(payment.itemType || payment.type),
        itemId: payment.itemId || '',
        buyerOpenid: payment.buyerOpenid || '',
        sellerOpenid: '',
        buyerNickName: '',
        sellerNickName: '',
        amount: payment.amount || 0,
        commission: 0,
        sellerAmount: 0,
        paymentStatus: normalizePaymentStatus(payment.status),
        orderStatus: normalizePaymentOrderStatus(payment.status),
        outTradeNo: payment.outTradeNo,
        createTime: payment.createTime,
        payTime: payment.payTime || null,
        completeTime: null,
        remark: '支付记录未生成订单'
      }))
      .filter(order => !orderStatus || orderStatus === 'all' || order.orderStatus === orderStatus)

    const existingMarketItemIds = new Set([
      ...orders,
      ...paymentOrders
    ]
      .filter(order => normalizeOrderType(order.type) === 'market')
      .map(order => order.itemId)
      .filter(Boolean))

    let marketOrders = []
    if (!type || type === 'all' || type === 'market') {
      const marketWhere = {}
      if (where.createTime) {
        marketWhere.createTime = where.createTime
      }
      if (keyword) {
        const reg = db.RegExp({ regexp: keyword, options: 'i' })
        marketWhere.$or = [
          { title: reg },
          { contact: reg }
        ]
      }

      const marketItems = await getAll(db.collection('market')
        .where(marketWhere)
        .field({
          _id: true,
          title: true,
          price: true,
          openid: true,
          contact: true,
          status: true,
          payOrderNo: true,
          createTime: true,
          payTime: true,
          updateTime: true
        })
        .orderBy('createTime', 'desc')).catch(error => {
          console.error('getOrders market query failed:', error)
          return []
        })

      marketOrders = marketItems
        .filter(item => !existingMarketItemIds.has(item._id))
        .map(item => ({
          _id: `market_${item._id}`,
          type: 'market',
          itemId: item._id,
          buyerOpenid: '',
          sellerOpenid: item.openid || '',
          buyerNickName: '',
          sellerNickName: item.contact || '',
          amount: item.price || 0,
          commission: 0,
          sellerAmount: item.price || 0,
          paymentStatus: marketToPaymentStatus(item.status),
          orderStatus: marketToOrderStatus(item.status),
          outTradeNo: item.payOrderNo || '',
          createTime: item.createTime,
          payTime: item.payTime || null,
          completeTime: item.status === 'sold' ? (item.updateTime || item.payTime || null) : null,
          remark: item.title || '二手商品'
        }))
        .filter(order => !paymentStatus || paymentStatus === 'all' || order.paymentStatus === paymentStatus)
        .filter(order => !orderStatus || orderStatus === 'all' || order.orderStatus === orderStatus)
    }

    const merged = [...orders, ...paymentOrders, ...marketOrders]
      .sort((a, b) => new Date(b.createTime || 0) - new Date(a.createTime || 0))

    const total = merged.length
    const list = merged.slice((page - 1) * pageSize, page * pageSize)

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

    // 查用户真实姓名，用于余额排行展示（优先姓名，其次昵称）
    const financeOpenids = [...new Set(financeList.map(f => f.openid).filter(Boolean))]
    const nameMap = {}
    for (let i = 0; i < financeOpenids.length; i += 100) {
      const batch = financeOpenids.slice(i, i + 100)
      const users = await db.collection('users').where({ openid: _.in(batch) }).get()
      users.data.forEach(u => {
        nameMap[u.openid] = u.name || u.nickName || ''
      })
    }

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
        name: nameMap[f.openid] || '',
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
    if (!['approve', 'reject'].includes(processAction)) {
      return { code: -1, msg: '无效的处理动作' }
    }

    // 系统自动转账的提现记录：不允许盲批/盲拒，但提供“核实落定”兜底
    if (record.source === 'auto') {
      if (record.status !== 'processing') {
        return { code: -1, msg: '该提现已由系统自动处理' }
      }
      return await verifyAutoWithdraw(finance, idx, record)
    }
    if (record.status !== 'pending') {
      return { code: -1, msg: '该提现记录已处理，不能重复操作' }
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
      updateData.availableAmount = Math.round(((finance.data.availableAmount || 0) + record.amount) * 100) / 100
      updateData.withdrawAmount = Math.round(((finance.data.withdrawAmount || 0) - record.amount) * 100) / 100
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
      getAll(db.collection('users').field({
        openid: true,
        stuId: true,
        phone: true,
        avatarUrl: true,
        name: true,
        nickName: true,
        createTime: true
      })).catch(() => []),
      getAll(db.collection('student').field({
        openid: true,
        stuId: true
      })).catch(() => []),
      getAll(db.collection('finance').field({
        openid: true,
        stuId: true,
        totalCommission: true,
        availableAmount: true,
        withdrawAmount: true,
        withdrawRecords: true
      })).catch(() => [])
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
      nickName: u.name || u.nickName || '',
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

// ============ 发布管理（商家端管理用户发布） ============

const POST_COLLECTIONS = {
  market: ['market'],
  help: ['help-carpool', 'help-express', 'help-partner', 'help-other'],
  lostfound: ['lostfound']
}

// 各类型发布允许编辑的字段白名单
const POST_EDIT_FIELDS = {
  market: ['title', 'price', 'originalPrice', 'category', 'condition', 'description', 'contact', 'status'],
  'help-carpool': ['from', 'to', 'time', 'people', 'contact', 'remark', 'status'],
  'help-express': ['pickupLocation', 'pickupCode', 'recipient', 'address', 'reward', 'deadline', 'contact', 'remark', 'status'],
  'help-partner': ['partnerType', 'time', 'location', 'people', 'contact', 'description', 'status'],
  'help-other': ['title', 'time', 'location', 'reward', 'contact', 'description', 'status'],
  lostfound: ['title', 'description', 'location', 'time', 'contact', 'type', 'status']
}

function resolvePostCollection(type, collection) {
  const list = POST_COLLECTIONS[type]
  if (!list) return ''
  if (collection && list.includes(collection)) return collection
  return list[0]
}

// 分页拉取用户发布（type: market/help/lostfound）
async function listPosts(data) {
  const { type = 'market', keyword = '', status = '', page = 1, pageSize = 10 } = data || {}
  const collections = POST_COLLECTIONS[type]
  if (!collections) return { code: -1, msg: '无效的发布类型' }

  try {
    let all = []
    for (const col of collections) {
      let query = db.collection(col)
      const where = {}
      if (status && status !== 'all') where.status = status
      if (keyword) {
        const reg = db.RegExp({ regexp: keyword, options: 'i' })
        where.$or = [
          { title: reg },
          { description: reg },
          { from: reg },
          { to: reg },
          { pickupLocation: reg }
        ]
      }
      if (Object.keys(where).length > 0) query = query.where(where)
      const res = await query.orderBy('createTime', 'desc').limit(100).get()
      res.data.forEach(d => all.push({ ...d, postType: type, collection: col }))
    }

    // 按时间倒序 + 分页
    all.sort((a, b) => new Date(b.createTime || 0) - new Date(a.createTime || 0))
    const total = all.length
    const start = (page - 1) * pageSize
    const list = all.slice(start, start + pageSize)

    // 补充发布者昵称
    const users = await getAll(db.collection('users')).catch(() => [])
    const nickMap = {}
    users.forEach(u => { if (u.openid) nickMap[u.openid] = u.nickName || (u.phone ? '用户' + u.phone.slice(-4) : '') })

    return {
      code: 0,
      data: {
        list: list.map(item => ({
          _id: item._id,
          postType: item.postType,
          collection: item.collection,
          title: item.title || item.from + ' → ' + item.to || item.pickupLocation || '',
          price: item.price,
          reward: item.reward,
          status: item.status,
          images: item.images || [],
          createTime: item.createTime,
          publisherNickName: nickMap[item.openid] || '未知用户',
          adminRemark: item.adminRemark || ''
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  } catch (e) {
    console.error('listPosts error:', e)
    return { code: -1, msg: e.message }
  }
}

// 商家端修改用户发布（白名单字段 + 金额校验）
async function updatePost(data) {
  const { type, id, collection, update } = data || {}
  const col = resolvePostCollection(type, collection)
  if (!col || !id) return { code: -1, msg: '参数不完整' }

  const allowed = POST_EDIT_FIELDS[col] || []
  const clean = {}
  Object.keys(update || {}).forEach(k => {
    if (allowed.includes(k)) clean[k] = update[k]
  })

  // 金额校验：price / reward 必须为正数且最多两位小数
  if (clean.price !== undefined && !isValidAmount(clean.price)) {
    return { code: -1, msg: '价格必须是大于 0 且最多两位小数的金额' }
  }
  if (clean.reward !== undefined && !isValidAmount(clean.reward)) {
    return { code: -1, msg: '酬金必须是大于 0 且最多两位小数的金额' }
  }

  clean.updateTime = db.serverDate()

  try {
    await db.collection(col).doc(id).update({ data: clean })
    return { code: 0, msg: '修改成功' }
  } catch (e) {
    console.error('updatePost error:', e)
    return { code: -1, msg: e.message }
  }
}

// 商家端删除用户发布
async function deletePost(data) {
  const { type, id, collection } = data || {}
  const col = resolvePostCollection(type, collection)
  if (!col || !id) return { code: -1, msg: '参数不完整' }

  try {
    await db.collection(col).doc(id).remove()
    return { code: 0, msg: '删除成功' }
  } catch (e) {
    console.error('deletePost error:', e)
    return { code: -1, msg: e.message }
  }
}

// 商家端给用户发布添加/更新备注（存 adminRemark，不影响用户展示字段）
async function remarkPost(data) {
  const { type, id, collection, remark } = data || {}
  const col = resolvePostCollection(type, collection)
  if (!col || !id) return { code: -1, msg: '参数不完整' }

  try {
    await db.collection(col).doc(id).update({
      data: {
        adminRemark: String(remark || '').trim().slice(0, 200),
        updateTime: db.serverDate()
      }
    })
    return { code: 0, msg: '备注已保存' }
  } catch (e) {
    console.error('remarkPost error:', e)
    return { code: -1, msg: e.message }
  }
}

// 商家端群发消息：给所有注册用户各写一条站内通知
async function broadcastMessage(data) {
  const { title, content } = data || {}
  const text = String(content || '').trim()
  if (!text) {
    return { code: -1, msg: '消息内容不能为空' }
  }
  const msgTitle = String(title || '平台通知').trim().slice(0, 30)
  const safeContent = text.slice(0, 500)

  try {
    // 收集所有用户 openid（去重）
    const users = await getAll(db.collection('users'))
    const openids = []
    const seen = {}
    users.forEach(u => {
      const oid = u.openid
      if (oid && !seen[oid]) {
        seen[oid] = true
        openids.push(oid)
      }
    })

    if (openids.length === 0) {
      return { code: -1, msg: '暂无用户可发送' }
    }

    // 分批写入 messages，避免单次并发过多
    const CHUNK = 100
    for (let i = 0; i < openids.length; i += CHUNK) {
      const batch = openids.slice(i, i + CHUNK)
      await Promise.all(batch.map(oid =>
        db.collection('messages').add({
          data: {
            toOpenid: oid,
            title: msgTitle,
            content: safeContent,
            type: 'admin',
            relatedId: '',
            relatedType: 'admin',
            isRead: false,
            createTime: db.serverDate()
          }
        })
      ))
    }

    return { code: 0, msg: `群发成功，已发送给 ${openids.length} 名用户` }
  } catch (e) {
    console.error('群发消息失败:', e)
    return { code: -1, msg: e.message }
  }
}

// 商家端给用户发站内消息（写入 messages 集合，用户消息中心可见）
async function sendUserMessage(data) {
  const { targetOpenid, title, content } = data || {}
  if (!targetOpenid) {
    return { code: -1, msg: '缺少目标用户' }
  }
  const text = String(content || '').trim()
  if (!text) {
    return { code: -1, msg: '消息内容不能为空' }
  }

  try {
    await db.collection('messages').add({
      data: {
        toOpenid: targetOpenid,
        title: String(title || '平台通知').trim().slice(0, 30),
        content: text.slice(0, 500),
        type: 'admin',
        relatedId: '',
        relatedType: 'admin',
        isRead: false,
        createTime: db.serverDate()
      }
    })
    return { code: 0, msg: '发送成功' }
  } catch (e) {
    console.error('发送用户消息失败:', e)
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
      .field({
        _id: true,
        type: true,
        amount: true,
        buyerOpenid: true,
        sellerOpenid: true,
        buyerNickName: true,
        sellerNickName: true,
        paymentStatus: true,
        createTime: true
      })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    // 查买卖家当前真实姓名，优先用姓名展示（老订单存的是手机尾号昵称）
    const openids = new Set()
    orders.data.forEach(o => {
      if (o.buyerOpenid) openids.add(o.buyerOpenid)
      if (o.sellerOpenid) openids.add(o.sellerOpenid)
    })

    const nameMap = {}
    if (openids.size > 0) {
      const users = await db.collection('users')
        .where({ openid: _.in([...openids]) })
        .field({
          openid: true,
          name: true,
          nickName: true
        })
        .get()
      users.data.forEach(u => {
        nameMap[u.openid] = u.name || u.nickName || ''
      })
    }

    return {
      code: 0,
      data: orders.data.map(o => ({
        id: o._id,
        type: o.type,
        amount: o.amount,
        buyer: (o.buyerOpenid && nameMap[o.buyerOpenid]) || o.buyerNickName || '匿名',
        seller: (o.sellerOpenid && nameMap[o.sellerOpenid]) || o.sellerNickName || '匿名',
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
