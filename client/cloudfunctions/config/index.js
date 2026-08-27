const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const CONFIG_CACHE_TTL = 5 * 60 * 1000
const configCache = {}
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

  const cached = getConfigCache('adminOpenids')
  if (cached) return cached.includes(openid)

  try {
    const adminDoc = await db.collection('config').doc('admin').get()
    const list = adminDoc.data && (adminDoc.data.openidList || adminDoc.data.openids)
    setConfigCache('adminOpenids', Array.isArray(list) ? list : [])
    return Array.isArray(list) && list.includes(openid)
  } catch (e) {
    return false
  }
}

async function getHomeConfig() {
  const config = await getHomeConfigFromCollection('config')
    || await getHomeConfigFromCollection('configs')
    || { bannerList: [], announcement: { show: false, title: '', content: '' } }
  return { code: 0, data: config }
}

async function getHomeConfigFromCollection(collectionName) {
  try {
    const config = await db.collection(collectionName).doc('homeConfig').get()
    return config.data
  } catch (error) {
    if (error.errCode === -502005) return null
    throw error
  }
}

async function updateHomeConfig(data, openid) {
  if (!(await isAdmin(openid))) {
    return { code: -1, msg: '无权限' }
  }

  try {
    const homeConfig = {
      bannerList: data.bannerList || [],
      announcement: data.announcement || { show: false },
      updateTime: db.serverDate()
    }
    await db.collection('config').doc('homeConfig').set({
      data: homeConfig
    })

    try {
      await db.collection('configs').doc('homeConfig').set({
        data: homeConfig
      })
    } catch (syncError) {
      console.error('同步历史配置集合失败:', syncError)
    }

    const savedConfig = await getHomeConfigFromCollection('config')
    const savedAnnouncement = savedConfig && savedConfig.announcement
    if (!savedAnnouncement
      || savedAnnouncement.content !== homeConfig.announcement.content
      || savedAnnouncement.title !== homeConfig.announcement.title
      || savedAnnouncement.show !== homeConfig.announcement.show) {
      return { code: -1, msg: '公告保存后校验失败，请重试' }
    }

    delete configCache.homeConfig
    return {
      code: 0,
      msg: '更新成功',
      data: {
        announcement: savedAnnouncement
      }
    }
  } catch (error) {
    console.error('更新配置失败:', error)
    return { code: -1, msg: '更新失败: ' + error.message }
  }
}

function getConfigCache(key) {
  const cache = configCache[key]
  if (!cache || cache.expireAt <= Date.now()) {
    delete configCache[key]
    return null
  }
  return cache.value
}

function setConfigCache(key, value) {
  configCache[key] = {
    value,
    expireAt: Date.now() + CONFIG_CACHE_TTL
  }
}

async function initConfig() {
  try {
    // 检查配置是否已存在
    const existing = await db.collection('config').doc('homeConfig').get()
    if (existing.data) {
      return { code: 0, msg: '配置已存在', data: existing.data }
    }
  } catch (error) {
    // 配置不存在，创建默认配置
    if (error.errCode === -502005) {
      try {
        await db.collection('config').add({
          data: {
            _id: 'homeConfig',
            bannerList: [],
            announcement: { show: false, title: '', content: '' },
            createTime: db.serverDate()
          }
        })
        return { code: 0, msg: '初始化成功' }
      } catch (addError) {
        console.error('初始化配置失败:', addError)
        return { code: -1, msg: '初始化失败' }
      }
    }
  }
  return { code: 0, msg: '配置已存在' }
}

exports.main = async (event, context) => {
  const { action, data = {} } = event
  const OPENID = cloud.getWXContext().OPENID

  try {
    switch (action) {
      case 'getHomeConfig':
        return await getHomeConfig()
      case 'updateHomeConfig':
        return await updateHomeConfig(data, OPENID)
      case 'initConfig':
        return await initConfig()
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}
