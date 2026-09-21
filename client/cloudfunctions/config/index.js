const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const CONFIG_CACHE_TTL = 5 * 60 * 1000
const configCache = {}
// 公告位对应的用户：不硬编码，改在云函数环境变量中配置
//   ANNOUNCEMENT_USER_NAME / ANNOUNCEMENT_USER_PHONE（详见 README）
const ANNOUNCEMENT_USER = {
  name: process.env.ANNOUNCEMENT_USER_NAME || '',
  phone: process.env.ANNOUNCEMENT_USER_PHONE || ''
}

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
  const announcementUser = await getAnnouncementUser()
  if (!announcementUser) {
    return { code: 0, data: { bannerList: [], announcement: { show: false, title: '', content: '' } } }
  }
  return {
    code: 0,
    data: {
      bannerList: [],
      announcement: normalizeAnnouncementMessage(announcementUser.message)
    }
  }
}

async function updateHomeConfig(data, openid) {
  if (!(await isAdmin(openid))) {
    return { code: -1, msg: '无权限' }
  }

  try {
    const announcement = data.announcement || { show: false, title: '', content: '' }
    const announcementUser = await getAnnouncementUser()
    if (!announcementUser || !announcementUser._id) {
      return { code: -1, msg: `找不到公告用户：${ANNOUNCEMENT_USER.name} / ${ANNOUNCEMENT_USER.phone}` }
    }

    await db.collection('users').doc(announcementUser._id).update({
      data: {
        message: stringifyAnnouncementMessage(announcement),
        updateTime: db.serverDate()
      }
    })

    const savedAnnouncement = normalizeAnnouncementMessage(announcement)

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

async function getAnnouncementUser() {
  // 未配置公告用户时直接返回，避免 where({name:''}) 误匹配任意用户
  if (!ANNOUNCEMENT_USER.name) return null
  const userRes = await db.collection('users')
    .where({ name: ANNOUNCEMENT_USER.name })
    .field({
      _id: true,
      name: true,
      phone: true,
      message: true
    })
    .limit(20)
    .get()
  const users = userRes.data || []
  return users.find(user => String(user.phone || '') === ANNOUNCEMENT_USER.phone)
}

function normalizeAnnouncementMessage(message) {
  if (typeof message === 'string') {
    const content = message.trim()
    if (content.charAt(0) === '{') {
      try {
        return normalizeAnnouncementMessage(JSON.parse(content))
      } catch (error) {
        console.error('解析公告消息失败:', error)
      }
    }
    return {
      show: !!content,
      title: '平台公告',
      content
    }
  }
  const content = message && typeof message.content === 'string' ? message.content.trim() : ''
  const title = message && typeof message.title === 'string' ? message.title.trim() : ''
  return {
    show: !!content && (!message || message.show !== false),
    title: title || '平台公告',
    content
  }
}

function stringifyAnnouncementMessage(message) {
  const announcement = normalizeAnnouncementMessage(message)
  return JSON.stringify({
    show: announcement.show,
    title: announcement.title,
    content: announcement.content
  })
}

async function initConfig() {
  try {
    const announcementUser = await getAnnouncementUser()
    if (!announcementUser) {
      return { code: -1, msg: `找不到公告用户：${ANNOUNCEMENT_USER.name} / ${ANNOUNCEMENT_USER.phone}` }
    }

    if (!announcementUser.message) {
      await db.collection('users').doc(announcementUser._id).update({
        data: {
          message: stringifyAnnouncementMessage({ show: false, title: '', content: '' }),
          updateTime: db.serverDate()
        }
      })
    }
    return {
      code: 0,
      msg: '配置已存在',
      data: {
        bannerList: [],
        announcement: normalizeAnnouncementMessage(announcementUser.message)
      }
    }
  } catch (error) {
    console.error('初始化配置失败:', error)
    return { code: -1, msg: '初始化失败: ' + error.message }
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
