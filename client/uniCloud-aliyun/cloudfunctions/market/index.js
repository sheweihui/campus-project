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
  const result = await db.collection('market').add({
    data: {
      ...data,
      openid,
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

async function getMyList(openid, { page = 1, pageSize = 10 }) {
  const result = await db.collection('market')
    .where({ openid })
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