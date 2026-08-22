const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const CONFIG_CACHE_TTL = 5 * 60 * 1000
const configCache = {}

function getEnvAdminOpenids() {
  return (process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map(openid => openid.trim())
    .filter(Boolean)
}

async function isAdmin(openid) {
  if (!openid) return false
  const envOpenids = getEnvAdminOpenids()
  if (envOpenids.includes(openid)) return true
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
  const cached = getConfigCache('homeConfig')
  if (cached) return { code: 0, data: cached }

  try {
    const config = await db.collection('configs').doc('homeConfig').get()
    setConfigCache('homeConfig', config.data)
    return { code: 0, data: config.data }
  } catch (error) {
    if (error.errCode === -502005) {
      try {
        const config2 = await db.collection('config').doc('homeConfig').get()
        setConfigCache('homeConfig', config2.data)
        return { code: 0, data: config2.data }
      } catch (error2) {
        if (error2.errCode === -502005) {
          return { code: 0, data: { bannerList: [], announcement: { show: false } } }
        }
        return { code: -1, msg: error2.message }
      }
    }
    return { code: -1, msg: error.message }
  }
}

async function updateHomeConfig(data, openid) {
  if (!(await isAdmin(openid))) {
    return { code: -1, msg: '无权限' }
  }

  try {
    await db.collection('config').doc('homeConfig').set({
      data: {
        _id: 'homeConfig',
        bannerList: data.bannerList || [],
        announcement: data.announcement || { show: false },
        updateTime: db.serverDate()
      }
    })
    delete configCache.homeConfig
    return { code: 0, msg: '更新成功' }
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
