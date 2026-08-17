const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

const TEMPLATE_KEYS = ['ORDER_ACCEPT', 'ORDER_PAY', 'ORDER_COMPLETE', 'CHAT_MESSAGE']
const TEMPLATE_ENV_KEYS = {
  ORDER_ACCEPT: 'ORDER_ACCEPT_TEMPLATE_ID',
  ORDER_PAY: 'ORDER_PAY_TEMPLATE_ID',
  ORDER_COMPLETE: 'ORDER_COMPLETE_TEMPLATE_ID',
  CHAT_MESSAGE: 'CHAT_MESSAGE_TEMPLATE_ID'
}
const ADMIN_CONFIG_DOC_ID = 'admin'

function normalizeTemplateIds(source = {}) {
  return TEMPLATE_KEYS.reduce((result, key) => {
    const value = source[key] || source[key.toLowerCase()]
    result[key] = typeof value === 'string' ? value.trim() : ''
    return result
  }, {})
}

function getEnvTemplateIds() {
  return TEMPLATE_KEYS.reduce((result, key) => {
    result[key] = (process.env[TEMPLATE_ENV_KEYS[key]] || '').trim()
    return result
  }, {})
}

async function getTemplateIds() {
  const envTemplateIds = getEnvTemplateIds()

  try {
    const { data } = await db.collection('config').doc('templateIds').get()
    const dbTemplateIds = normalizeTemplateIds(data && (data.templates || data))
    return { ...envTemplateIds, ...dbTemplateIds }
  } catch (error) {
    console.warn('Failed to load subscribe template ids from config/templateIds:', error)
    return envTemplateIds
  }
}

function getEnvAdminOpenids() {
  return (process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map(openid => openid.trim())
    .filter(Boolean)
}

async function getConfiguredAdminOpenids() {
  const envOpenids = getEnvAdminOpenids()

  try {
    const { data } = await db.collection('config').doc(ADMIN_CONFIG_DOC_ID).get()
    const dbOpenids = Array.isArray(data && data.openids) ? data.openids : []
    return [...new Set([...envOpenids, ...dbOpenids])]
  } catch (error) {
    console.warn('Failed to load admin config:', error)
    return envOpenids
  }
}

async function isAdmin(openid) {
  if (!openid) return false
  const adminOpenids = await getConfiguredAdminOpenids()
  return adminOpenids.includes(openid)
}

async function sendSubscribeMessage(touser, templateId, page, data) {
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser,
      templateId,
      page,
      data
    })
    return { success: true, result }
  } catch (error) {
    console.error('Failed to send subscribe message:', error)
    return { success: false, error: error.message }
  }
}

async function getOpenidByStuId(stuId) {
  try {
    const result = await db.collection('student').where({ stuId }).get()
    if (result.data.length > 0) {
      return result.data[0].openid
    }
    return null
  } catch (error) {
    console.error('Failed to get openid:', error)
    return null
  }
}

async function resolveOpenid(openid, stuId) {
  if (openid) return openid
  if (stuId) return getOpenidByStuId(stuId)
  return null
}

function missingTemplateResponse() {
  return { code: -1, msg: '\u672a\u914d\u7f6e\u6a21\u677fID' }
}

exports.main = async (event = {}, context) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()

  try {
    if (action === 'getTemplateIds') {
      return { code: 0, data: await getTemplateIds() }
    }

    const templates = await getTemplateIds()

    switch (action) {
      case 'send': {
        const allowed = await isAdmin(OPENID)
        if (!allowed) {
          return { code: -1, msg: '\u65e0\u6743\u9650\u53d1\u9001\u8ba2\u9605\u6d88\u606f' }
        }

        const { touser, templateId, templateKey, page, messageData } = data
        const resolvedTemplateId = templateKey ? templates[templateKey] : templateId
        if (!touser || !resolvedTemplateId || !page || !messageData) {
          return { code: -1, msg: '\u53d1\u9001\u53c2\u6570\u4e0d\u5b8c\u6574' }
        }

        const result = await sendSubscribeMessage(touser, resolvedTemplateId, page, messageData)
        return { code: 0, data: result }
      }

      case 'orderAccept': {
        const { publisherOpenid, publisherStuId, orderId, title, reward, type = 'other' } = data
        const touser = await resolveOpenid(publisherOpenid, publisherStuId)
        if (!touser) {
          return { code: -1, msg: '\u627e\u4e0d\u5230\u53d1\u5e03\u8005openid' }
        }

        const templateId = templates.ORDER_ACCEPT
        if (!templateId) return missingTemplateResponse()

        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          money2: { value: `\u00a5${reward}` },
          phrase3: { value: '\u6709\u4eba\u63a5\u5355' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }

      case 'orderPay': {
        const { acceptorOpenid, acceptorStuId, orderId, title, reward, type = 'other' } = data
        const touser = await resolveOpenid(acceptorOpenid, acceptorStuId)
        if (!touser) {
          return { code: -1, msg: '\u627e\u4e0d\u5230\u63a5\u5355\u8005openid' }
        }

        const templateId = templates.ORDER_PAY
        if (!templateId) return missingTemplateResponse()

        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          money2: { value: `\u00a5${reward}` },
          phrase3: { value: '\u916c\u91d1\u5df2\u652f\u4ed8' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }

      case 'orderComplete': {
        const { acceptorOpenid, acceptorStuId, orderId, title, type = 'other' } = data
        const touser = await resolveOpenid(acceptorOpenid, acceptorStuId)
        if (!touser) {
          return { code: -1, msg: '\u627e\u4e0d\u5230\u63a5\u5355\u8005openid' }
        }

        const templateId = templates.ORDER_COMPLETE
        if (!templateId) return missingTemplateResponse()

        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          phrase3: { value: '\u4efb\u52a1\u5df2\u5b8c\u6210' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }

      case 'chat': {
        const { touser, fromStuId, content } = data
        const templateId = templates.CHAT_MESSAGE
        if (!templateId) return missingTemplateResponse()

        const result = await sendSubscribeMessage(touser, templateId, '/pages/chat/chat', {
          thing1: { value: `${fromStuId}: ${content}` },
          phrase2: { value: '\u6536\u5230\u65b0\u6d88\u606f' },
          time3: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }

      default:
        return { code: -1, msg: '\u672a\u77e5\u64cd\u4f5c' }
    }
  } catch (error) {
    console.error('sendMessage cloud function error:', error)
    return { code: -1, msg: error.message }
  }
}
