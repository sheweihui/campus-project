const cloud = require('wx-server-sdk')
const ENV_ID = 'cloudbase-d6gny18wlbad9e070'
cloud.init({ env: ENV_ID })

const db = cloud.database()
const _ = db.command
const CACHE_COLLECTION = 'query_cache'
const CACHE_TTL = 60 * 1000
const PHONE_CACHE_TTL = 5 * 60 * 1000
const memoryCache = {}
const phoneCache = {}

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'add':
        return await addMarket(data, OPENID)
      case 'list':
        return await listMarket(data)
      case 'homeList':
        return await getHomeList(data)
      case 'detail':
        return await getDetail(data)
      case 'update':
        return await updateMarket(data, OPENID)
      case 'delete':
        return await deleteMarket(data, OPENID)
      case 'myList':
        return await getMyList(OPENID, data)
      case 'updateStatus':
        return await updateStatus(data, OPENID)
      case 'search':
        return await searchMarket(data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

function cacheKey(parts) {
  return parts.map(part => encodeURIComponent(String(part === undefined || part === null ? '' : part))).join(':')
}

async function getCache(key) {
  const cached = getMemoryCache(key)
  if (cached) return cached

  try {
    const res = await db.collection(CACHE_COLLECTION).doc(key).get()
    if (res.data && res.data.expireAt > Date.now()) {
      setMemoryCache(key, res.data.value)
      return res.data.value
    }
  } catch (error) {
    return null
  }
  return null
}

function getMemoryCache(key) {
  const cache = memoryCache[key]
  if (!cache || cache.expireAt <= Date.now()) {
    delete memoryCache[key]
    return null
  }
  return cache.value
}

function setMemoryCache(key, value) {
  memoryCache[key] = {
    value,
    expireAt: Date.now() + CACHE_TTL
  }
}

async function setCache(key, value, group = 'market') {
  setMemoryCache(key, value)
  try {
    await db.collection(CACHE_COLLECTION).doc(key).set({
      data: {
        group,
        value,
        expireAt: Date.now() + CACHE_TTL,
        updateTime: db.serverDate()
      }
    })
  } catch (error) {
    console.error('写入查询缓存失败:', error)
  }
}

async function clearCache(group = 'market') {
  Object.keys(memoryCache).forEach(key => {
    delete memoryCache[key]
  })
  try {
    await db.collection(CACHE_COLLECTION).where({ group }).remove()
  } catch (error) {
    console.error('清理查询缓存失败:', error)
  }
}

async function addMarket(data, openid) {
  // 发布必须完成微信登录并绑定手机号（拦截游客）
  const phone = await getPhoneByOpenid(openid)
  if (!phone) {
    return { code: -1, msg: '请先完成微信登录并绑定手机号后再发布' }
  }

  // 忽略客户端传入的 stuId
  const { _id, id, stuId: clientStuId, ...restData } = data

  // 服务端价格校验：必须为合法正数且最多两位小数，且不超过 100 万
  if (!isValidAmount(restData.price) || Number(restData.price) > 10000) {
    return { code: -1, msg: '价格必须大于 0、最多两位小数且不超过 1 万' }
  }
  // 原价（选填）：必须为非负数且最多两位小数
  if (restData.originalPrice !== undefined && restData.originalPrice !== null && restData.originalPrice !== '') {
    if (!isValidNonNegativeAmount(restData.originalPrice) || Number(restData.originalPrice) > 10000) {
      return { code: -1, msg: '原价必须小于等于 1 万且最多两位小数' }
    }
  }
  // 字段长度/数量限制
  if (String(restData.title || '').length > 50) {
    return { code: -1, msg: '标题最多 50 字' }
  }
  if (String(restData.description || '').length > 1000) {
    return { code: -1, msg: '描述最多 1000 字' }
  }
  if (String(restData.contact || '').length > 50) {
    return { code: -1, msg: '联系方式最多 50 字' }
  }
  if (!Array.isArray(restData.images) || restData.images.length > 6) {
    return { code: -1, msg: '图片最多 6 张' }
  }

  const result = await db.collection('market').add({
    data: {
      ...restData,
      openid,
      phone,
      stuId: '',
      status: 'onSale',
      viewCount: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  await clearCache()
  return { code: 0, data: result._id }
}

function trimListImages(data) {
  return data.map(item => ({
    ...item,
    images: Array.isArray(item.images) && item.images.length > 0 ? [item.images[0]] : []
  }))
}

function isCloudFileID(url) {
  return typeof url === 'string' && url.startsWith('cloud://')
}

async function resolveImageUrls(items) {
  const list = Array.isArray(items) ? items : [items]
  const fileIDs = [...new Set(list
    .flatMap(item => Array.isArray(item.images) ? item.images : [])
    .filter(isCloudFileID))]

  if (fileIDs.length === 0) {
    return items
  }

  try {
    const res = await cloud.getTempFileURL({ fileList: fileIDs })
    const urlMap = {}
    ;(res.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) {
        urlMap[file.fileID] = file.tempFileURL
      }
    })

    const convert = item => ({
      ...item,
      images: Array.isArray(item.images)
        ? item.images.map(image => urlMap[image] || image)
        : []
    })
    return Array.isArray(items) ? list.map(convert) : convert(items)
  } catch (error) {
    console.error('转换商品图片临时链接失败:', error)
    return items
  }
}

async function resolveMarketResponseImages(response) {
  if (!response || !Array.isArray(response.data)) {
    return response
  }
  return {
    ...response,
    data: await resolveImageUrls(response.data)
  }
}

async function listMarket({ category, page = 1, pageSize = 10, scene = '' }) {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(20, Math.max(1, Number(pageSize) || 10))
  const key = cacheKey(['market', 'list', category || 'all', page, pageSize, scene || 'default'])
  const cached = await getCache(key)
  if (cached) return await resolveMarketResponseImages(cached)

  const where = { status: 'onSale' }
  if (category && category !== 'all') {
    where.category = category
  }
  
  let query = db.collection('market')
    .where(where)

  if (scene === 'home' || scene === 'list') {
    query = query.field({
      _id: true,
      title: true,
      price: true,
      category: true,
      condition: true,
      images: true,
      viewCount: true,
      createTime: true
    })
  }

  const result = await query
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  const response = { code: 0, data: await resolveImageUrls(trimListImages(result.data)) }
  setCache(key, response).catch(error => {
    console.error('异步写入市场列表缓存失败:', error)
  })
  return response
}

async function getHomeList({ pageSize = 4 } = {}) {
  return listMarket({ page: 1, pageSize, scene: 'home' })
}

async function getDetail({ id }) {
  const result = await db.collection('market').doc(id).get()
  
  // 增加浏览次数
  await db.collection('market').doc(id).update({
    data: {
      viewCount: _.inc(1)
    }
  })
  
  return { code: 0, data: await resolveImageUrls(result.data) }
}

async function updateMarket(data, openid) {
  const { id, ...updateData } = data
  const item = await db.collection('market').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  // 学号由服务端维护，不允许通过编辑修改
  delete updateData.stuId
  // 只读字段不允许通过编辑修改
  ;['openid', 'status', 'viewCount', 'createTime', 'updateTime', 'payTime', 'payOrderNo', 'payClaimTime'].forEach(k => {
    delete updateData[k]
  })

  // 价格校验：必须为合法正数且最多两位小数
  if (updateData.price !== undefined) {
    if (!isValidAmount(updateData.price) || Number(updateData.price) > 10000) {
      return { code: -1, msg: '价格必须大于 0、最多两位小数且不超过 1 万' }
    }
    // 交易中/已售出禁止改价，避免实付与展示不一致
    if (item.data.status === 'paying' || item.data.status === 'sold') {
      return { code: -1, msg: '商品交易中或已售出，不能修改价格' }
    }
  }

  // 原价（选填）：必须为非负数且最多两位小数
  if (updateData.originalPrice !== undefined) {
    if (updateData.originalPrice === null || updateData.originalPrice === '') {
      updateData.originalPrice = null
    } else if (!isValidNonNegativeAmount(updateData.originalPrice) || Number(updateData.originalPrice) > 10000) {
      return { code: -1, msg: '原价必须小于等于 1 万且最多两位小数' }
    }
  }
  // 字段长度限制
  if (updateData.title !== undefined && String(updateData.title || '').length > 50) {
    return { code: -1, msg: '标题最多 50 字' }
  }
  if (updateData.description !== undefined && String(updateData.description || '').length > 1000) {
    return { code: -1, msg: '描述最多 1000 字' }
  }
  if (updateData.contact !== undefined && String(updateData.contact || '').length > 50) {
    return { code: -1, msg: '联系方式最多 50 字' }
  }
  if (updateData.images !== undefined && (!Array.isArray(updateData.images) || updateData.images.length > 6)) {
    return { code: -1, msg: '图片最多 6 张' }
  }

  await db.collection('market').doc(id).update({
    data: {
      ...updateData,
      updateTime: db.serverDate()
    }
  })
  await clearCache()
  return { code: 0, msg: '更新成功' }
}

async function deleteMarket({ id }, openid) {
  const item = await db.collection('market').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限删除' }
  }

  // 交易中/已售出禁止删除，避免资金记录与商品状态脱节
  if (item.data.status === 'paying' || item.data.status === 'sold') {
    return { code: -1, msg: '商品交易中或已售出，不能删除' }
  }

  await db.collection('market').doc(id).remove()
  await clearCache()
  return { code: 0, msg: '删除成功' }
}

async function getMyList(openid, { status, page = 1, pageSize = 10 }) {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(20, Math.max(1, Number(pageSize) || 10))
  // 只允许查询自己的发布，忽略客户端传入的 stuId
  const where = { openid }
  if (status && status !== 'all') {
    where.status = status
  }
  const result = await db.collection('market')
    .where(where)
    .field({
      _id: true,
      title: true,
      price: true,
      category: true,
      status: true,
      images: true,
      viewCount: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: await resolveImageUrls(trimListImages(result.data)) }
}

async function updateStatus({ id, status }, openid) {
  const item = await db.collection('market').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  // 支付进行中的商品不允许修改状态
  if (item.data.status === 'paying') {
    return { code: -1, msg: '商品交易中，请等待支付完成' }
  }

  await db.collection('market').doc(id).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
  await clearCache()
  return { code: 0, msg: '状态更新成功' }
}

async function searchMarket({ keyword, page = 1, pageSize = 10 }) {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(20, Math.max(1, Number(pageSize) || 10))
  keyword = String(keyword || '').trim().slice(0, 30)
  if (!keyword) return { code: 0, data: [] }
  const key = cacheKey(['market', 'search', keyword, page, pageSize])
  const cached = await getCache(key)
  if (cached) return await resolveMarketResponseImages(cached)

  const result = await db.collection('market')
    .where({
      status: 'onSale',
      title: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    })
    .field({
      _id: true,
      title: true,
      price: true,
      category: true,
      condition: true,
      images: true,
      viewCount: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  const response = { code: 0, data: await resolveImageUrls(trimListImages(result.data)) }
  setCache(key, response).catch(error => {
    console.error('异步写入市场搜索缓存失败:', error)
  })
  return response
}

// 校验调用者是否已绑定学号
// 通过 openid 查询绑定的手机号
async function getPhoneByOpenid(openid) {
  if (!openid) return ''
  const cached = phoneCache[openid]
  if (cached && cached.expireAt > Date.now()) {
    return cached.phone
  }
  try {
    const res = await db.collection('users')
      .where({ openid })
      .field({ phone: true })
      .get()
    const phone = res.data.length > 0 ? (res.data[0].phone || '') : ''
    phoneCache[openid] = {
      phone,
      expireAt: Date.now() + PHONE_CACHE_TTL
    }
    return phone
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

// 金额校验：合法非负数且最多两位小数（用于原价等选填金额）
function isValidNonNegativeAmount(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return false
  return Math.abs(num * 100 - Math.round(num * 100)) <= 0.001
}
