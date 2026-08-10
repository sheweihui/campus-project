const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'add':
        return await addHelp(data, OPENID)
      case 'list':
        return await listHelp(data)
      case 'detail':
        return await getDetail(data)
      case 'update':
        return await updateHelp(data, OPENID)
      case 'delete':
        return await deleteHelp(data, OPENID)
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

async function addHelp(data, openid) {
  const collection = getCollectionByType(data.type)
  const result = await db.collection(collection).add({
    data: {
      ...data,
      openid,
      status: data.type === 'express' ? 'pending' : 'active',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { code: 0, data: result._id }
}

async function listHelp({ type, page = 1, pageSize = 10 }) {
  const collection = getCollectionByType(type)
  const where = {}
  
  if (type === 'express') {
    where.status = _.in(['pending', 'accepted'])
  } else {
    where.status = 'active'
  }

  const result = await db.collection(collection)
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function getDetail({ type, id }) {
  const collection = getCollectionByType(type)
  const result = await db.collection(collection).doc(id).get()
  return { code: 0, data: result.data }
}

async function updateHelp(data, openid) {
  const { type, id, ...updateData } = data
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  await db.collection(collection).doc(id).update({
    data: {
      ...updateData,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '更新成功' }
}

async function deleteHelp({ type, id }, openid) {
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限删除' }
  }

  await db.collection(collection).doc(id).remove()
  return { code: 0, msg: '删除成功' }
}

async function getMyList(openid, { type, page = 1, pageSize = 10 }) {
  const collection = getCollectionByType(type)
  const result = await db.collection(collection)
    .where({ openid })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function updateStatus({ type, id, status }, openid) {
  const collection = getCollectionByType(type)
  const item = await db.collection(collection).doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  await db.collection(collection).doc(id).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '状态更新成功' }
}

function getCollectionByType(type) {
  const map = {
    'carpool': 'help-carpool',
    'express': 'help-express',
    'partner': 'help-partner'
  }
  return map[type] || 'help-carpool'
}