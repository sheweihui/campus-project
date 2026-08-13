const cloud = require('wx-server-sdk')
cloud.init()

// 模板 ID 在 client/config/templateIds.js 填写后同步到这里
const TEMPLATES = {
  ORDER_ACCEPT: '',
  ORDER_PAY: '',
  ORDER_COMPLETE: '',
  CHAT_MESSAGE: ''
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
    console.error('发送订阅消息失败:', error)
    return { success: false, error: error.message }
  }
}

async function getOpenidByStuId(stuId) {
  try {
    const db = cloud.database()
    const result = await db.collection('student').where({ stuId }).get()
    if (result.data.length > 0) {
      return result.data[0].openid
    }
    return null
  } catch (error) {
    console.error('获取openid失败:', error)
    return null
  }
}

// 优先使用调用方传入的 openid（当前登录体系为微信手机号），兼容旧的按学号查询
async function resolveOpenid(openid, stuId) {
  if (openid) return openid
  if (stuId) return getOpenidByStuId(stuId)
  return null
}

exports.main = async (event, context) => {
  const { action, data } = event
  
  try {
    switch (action) {
      case 'send': {
        const { touser, templateId, page, messageData } = data
        const result = await sendSubscribeMessage(touser, templateId, page, messageData)
        return { code: 0, data: result }
      }
      
      case 'orderAccept': {
        const { publisherOpenid, publisherStuId, orderId, title, reward, type = 'other' } = data
        const touser = await resolveOpenid(publisherOpenid, publisherStuId)
        if (!touser) {
          return { code: -1, msg: '找不到发布者openid' }
        }
        
        const templateId = TEMPLATES.ORDER_ACCEPT
        if (!templateId) {
          return { code: -1, msg: '未配置模板ID' }
        }
        
        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          money2: { value: `¥${reward}` },
          phrase3: { value: '有人接单' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }
      
      case 'orderPay': {
        const { acceptorOpenid, acceptorStuId, orderId, title, reward, type = 'other' } = data
        const touser = await resolveOpenid(acceptorOpenid, acceptorStuId)
        if (!touser) {
          return { code: -1, msg: '找不到接单者openid' }
        }
        
        const templateId = TEMPLATES.ORDER_PAY
        if (!templateId) {
          return { code: -1, msg: '未配置模板ID' }
        }
        
        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          money2: { value: `¥${reward}` },
          phrase3: { value: '酬金已支付' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }
      
      case 'orderComplete': {
        // 发布者确认完成后，通知接单者任务已完成
        const { acceptorOpenid, acceptorStuId, orderId, title, type = 'other' } = data
        const touser = await resolveOpenid(acceptorOpenid, acceptorStuId)
        if (!touser) {
          return { code: -1, msg: '找不到接单者openid' }
        }
        
        const templateId = TEMPLATES.ORDER_COMPLETE
        if (!templateId) {
          return { code: -1, msg: '未配置模板ID' }
        }
        
        const result = await sendSubscribeMessage(touser, templateId, `/pages/help/detail?id=${orderId}&type=${type}`, {
          thing1: { value: title },
          phrase3: { value: '任务已完成' },
          time4: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }
      
      case 'chat': {
        const { touser, fromStuId, content } = data
        const templateId = TEMPLATES.CHAT_MESSAGE
        if (!templateId) {
          return { code: -1, msg: '未配置模板ID' }
        }
        
        const result = await sendSubscribeMessage(touser, templateId, '/pages/chat/chat', {
          thing1: { value: `${fromStuId}: ${content}` },
          phrase2: { value: '收到新消息' },
          time3: { value: new Date().toLocaleString('zh-CN') }
        })
        return { code: 0, data: result }
      }
      
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('sendMessage云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}
