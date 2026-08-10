const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const data = event.data || {}
  const content = String(data.content || '').trim()

  if (!content) {
    return { code: -1, msg: '反馈内容不能为空' }
  }

  try {
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
