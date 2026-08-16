const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 确保集合存在：不存在时自动创建（已存在会报错，忽略即可）
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    // 集合已存在或其它错误：继续走 add，由 add 暴露真实问题
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const data = event.data || {}
  const content = String(data.content || '').trim()

  if (!content) {
    return { code: -1, msg: '反馈内容不能为空' }
  }
  if (content.length > 1000) {
    return { code: -1, msg: '反馈内容最多 1000 字' }
  }
  if (String(data.contact || '').length > 50) {
    return { code: -1, msg: '联系方式最多 50 字' }
  }

  try {
    await ensureCollection('feedback')
    await db.collection('feedback').add({
      data: {
        type: data.type || '',
        content,
        contact: data.contact || '',
        openid: OPENID,
        createTime: db.serverDate()
      }
    })
    return { code: 0, msg: '提交成功' }
  } catch (error) {
    console.error('反馈提交失败:', error)
    return { code: -1, msg: error.message }
  }
}
