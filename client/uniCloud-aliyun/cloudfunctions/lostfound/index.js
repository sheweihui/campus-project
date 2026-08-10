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
        return await addLostFound(data, OPENID)
      case 'list':
        return await listLostFound(data)
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
  const result = await db.collection('lostfound').add({
    data: {
      ...data,
      openid,
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { code: 0, data: result._id }
}

async function listLostFound({ type, page = 1, pageSize = 10 }) {
  const where = type ? { type } : {}
  const result = await db.collection('lostfound')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
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

async function getMyList(openid, { page = 1, pageSize = 10 }) {
  const result = await db.collection('lostfound')
    .where({ openid })
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return { code: 0, data: result.data }
}

async function updateStatus({ id, status }, openid) {
  const item = await db.collection('lostfound').doc(id).get()
  
  if (item.data.openid !== openid) {
    return { code: -1, msg: '无权限修改' }
  }

  await db.collection('lostfound').doc(id).update({
    data: {
      status,
      updateTime: db.serverDate()
    }
  })
  return { code: 0, msg: '状态更新成功' }
}