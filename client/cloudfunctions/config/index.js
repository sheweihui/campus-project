const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const CONFIG_CACHE_TTL = 5 * 60 * 1000
const configCache = {}
const ANNOUNCEMENT_USER = {
  name: 'snake',
  phone: '13276057867'
}
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
        message: announcement,
        updateTime: db.serverDate()
      }
    })

    const savedUser = await db.collection('users').doc(announcementUser._id).get()
    const savedAnnouncement = normalizeAnnouncementMessage(savedUser.data && savedUser.data.message)
    const expectedAnnouncement = normalizeAnnouncementMessage(announcement)
    if (savedAnnouncement.content !== expectedAnnouncement.content
      || savedAnnouncement.title !== expectedAnnouncement.title
      || savedAnnouncement.show !== expectedAnnouncement.show) {
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

async function getAnnouncementUser() {
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

async function initConfig() {
  try {
    const announcementUser = await getAnnouncementUser()
    if (!announcementUser) {
      return { code: -1, msg: `找不到公告用户：${ANNOUNCEMENT_USER.name} / ${ANNOUNCEMENT_USER.phone}` }
    }

    if (!announcementUser.message) {
      await db.collection('users').doc(announcementUser._id).update({
        data: {
          message: { show: false, title: '', content: '' },
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
