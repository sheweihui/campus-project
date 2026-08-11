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
        return await addMarket(data, OPENID)
      case 'list':
        return await listMarket(data)
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

async function addMarket(data, openid) {
  // 发布必须完成学号登录（拦截游客）
  const stuId = await getStuIdByOpenid(openid)
  if (!stuId) {
    return { code: -1, msg: '请先完成学号登录后再发布' }
  }

  // 学号由服务端解析，忽略客户端传入的 stuId，防止冒用他人学号
  const { _id, id, stuId: clientStuId, ...restData } = data

  // 服务端价格校验：必须为合法正数
  if (!isValidAmount(restData.price)) {
    return { code: -1, msg: '价格必须是大于 0 且最多两位小数的金额' }
  }

  const result = await db.collection('market').add({
    data: {
      ...restData,
      openid,
      stuId: data.stuId || '',
      status: 'onSale',
      viewCount: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { code: 0, data: result._id }
}

async function listMarket({ category, page = 1, pageSize = 10 }) {
  const where = { status: 'onSale' }
  if (category && category !== 'all') {
    where.category = category
  }
  
  const result = await db.collection('market')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function getDetail({ id }) {
  const result = await db.collection('market').doc(id).get()
  
  // 增加浏览次数
  await db.collection('market').doc(id).update({
    data: {
      viewCount: _.inc(1)
    }
  })
  
  return { code: 0, data: result.data }
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
    if (!isValidAmount(updateData.price)) {
      return { code: -1, msg: '价格必须是大于 0 且最多两位小数的金额' }
    }
    // 交易中/已售出禁止改价，避免实付与展示不一致
    if (item.data.status === 'paying' || item.data.status === 'sold') {
      return { code: -1, msg: '商品交易中或已售出，不能修改价格' }
    }
  }

  await db.collection('market').doc(id).update({
    data: {
      ...updateData,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '更新成功' }
}

async function deleteMarket({ id }, openid) {
  const item = await db.collection('market').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限删除' }
  }

  await db.collection('market').doc(id).remove()
  return { code: 0, msg: '删除成功' }
}

async function getMyList(openid, { status, page = 1, pageSize = 10 }) {
  // 只允许查询自己的发布，忽略客户端传入的 stuId
  const where = { openid }
  if (status && status !== 'all') {
    where.status = status
  }
  const result = await db.collection('market')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
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
  return { code: 0, msg: '状态更新成功' }
}

async function searchMarket({ keyword, page = 1, pageSize = 10 }) {
  const result = await db.collection('market')
    .where({
      status: 'onSale',
      title: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

// 校验调用者是否已绑定学号
async function requireStudent(openid) {
  try {
    const res = await db.collection('student').where({ openid }).get()
    return res.data.length > 0 && !!res.data[0].stuId
  } catch (e) {
    return false
  }
}

// 通过 openid 查询绑定的学号
async function getStuIdByOpenid(openid) {
  try {
    const res = await db.collection('student').where({ openid }).get()
    return res.data.length > 0 ? (res.data[0].stuId || '') : ''
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
