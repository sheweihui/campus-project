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
        return await addLostFound(data, OPENID)
      case 'list':
        return await listLostFound(data)
      case 'homeList':
        return await getHomeList(data)
      case 'detail':
        return await getDetail(data)
      case 'update':
        return await updateLostFound(data, OPENID)
      case 'delete':
        return await deleteLostFound(data, OPENID)
      case 'myList':
        return await getMyList(OPENID, data)
      case 'updateStatus':
        return await updateStatus(data, OPENID)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function addLostFound(data, openid) {
  // 发布必须完成微信登录并绑定手机号（拦截游客）
  const phone = await getPhoneByOpenid(openid)
  if (!phone) {
    return { code: -1, msg: '请先完成微信登录并绑定手机号后再发布' }
  }

  // 忽略客户端传入的 stuId
  const { stuId: clientStuId, ...cleanData } = data

  if (String(cleanData.title || '').length > 50) {
    return { code: -1, msg: '标题最多 50 字' }
  }
  if (String(cleanData.description || '').length > 1000) {
    return { code: -1, msg: '描述最多 1000 字' }
  }
  if (String(cleanData.location || '').length > 100) {
    return { code: -1, msg: '地点最多 100 字' }
  }
  if (String(cleanData.contact || '').length > 50) {
    return { code: -1, msg: '联系方式最多 50 字' }
  }
  if (!Array.isArray(cleanData.images) || cleanData.images.length > 6) {
    return { code: -1, msg: '图片最多 6 张' }
  }

  const result = await db.collection('lostfound').add({
    data: {
      ...cleanData,
      openid,
      phone,
      stuId: '',
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { code: 0, data: result._id }
}

function trimListImages(data) {
  return data.map(item => ({
    ...item,
    images: Array.isArray(item.images) && item.images.length > 0 ? [item.images[0]] : []
  }))
}

async function listLostFound({ type, page = 1, pageSize = 10, scene = '' }) {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(20, Math.max(1, Number(pageSize) || 10))
  const where = type ? { type } : {}

  let query = db.collection('lostfound')
    .where(where)

  if (scene === 'home') {
    query = query.field({
      _id: true,
      title: true,
      type: true,
      time: true,
      images: true,
      createTime: true
    })
  } else if (scene === 'list') {
    query = query.field({
      _id: true,
      title: true,
      description: true,
      location: true,
      type: true,
      status: true,
      time: true,
      images: true,
      createTime: true
    })
  }

  const result = await query
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: trimListImages(result.data) }
}

async function getHomeList({ pageSize = 5 } = {}) {
  return listLostFound({ page: 1, pageSize, scene: 'home' })
}

async function getDetail({ id }) {
  const result = await db.collection('lostfound').doc(id).get()
  return { code: 0, data: result.data }
}

async function updateLostFound(data, openid) {
  const { id, ...updateData } = data
  const item = await db.collection('lostfound').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  // 学号由服务端维护，不允许通过编辑修改
  delete updateData.stuId
  // 只读字段不允许通过编辑修改
  ;['openid', 'status', 'createTime', 'updateTime'].forEach(k => {
    delete updateData[k]
  })

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

  await db.collection('lostfound').doc(id).update({
    data: {
      ...updateData,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '更新成功' }
}

async function deleteLostFound({ id }, openid) {
  const item = await db.collection('lostfound').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限删除' }
  }

  await db.collection('lostfound').doc(id).remove()
  return { code: 0, msg: '删除成功' }
}

async function getMyList(openid, { type, page = 1, pageSize = 10 }) {
  page = Math.max(1, Number(page) || 1)
  pageSize = Math.min(20, Math.max(1, Number(pageSize) || 10))
  // 只允许查询自己的发布，忽略客户端传入的 stuId
  const where = { openid }
  if (type && type !== 'all') {
    where.type = type
  }
  const result = await db.collection('lostfound')
    .where(where)
    .field({
      _id: true,
      title: true,
      description: true,
      type: true,
      status: true,
      images: true,
      createTime: true
    })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: trimListImages(result.data) }
}

async function updateStatus({ id, status }, openid) {
  const item = await db.collection('lostfound').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

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

  await db.collection('lostfound').doc(id).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '状态更新成功' }
}

// 通过 openid 查询绑定的手机号
async function getPhoneByOpenid(openid) {
  if (!openid) return ''
  try {
    const res = await db.collection('users').where({ openid }).get()
    return res.data.length > 0 ? (res.data[0].phone || '') : ''
  } catch (e) {
    return ''
  }
}
