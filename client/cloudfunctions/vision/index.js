// 视觉识别云函数：调用智谱 GLM-4.6V-Flash（open.bigmodel.cn）
// 用法：action=analyze，data={ image: 图片URL或cloud://文件ID, prompt: 提示词, thinking: 是否开启思考(默认false) }
// 鉴权：仅管理员可调用（避免 API 费用被滥用）；如需放开，修改下方 isAdmin 逻辑
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const https = require('https')
const fs = require('fs')
const path = require('path')

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-4.6v-flash'

// 读取 API Key：优先环境变量 ZHIPU_API_KEY，其次 config 集合 vision 文档 { apiKey: 'xxx' }
async function getApiKey() {
  if (process.env.ZHIPU_API_KEY) return process.env.ZHIPU_API_KEY
  // 本地 .apikey 文件（已被 .gitignore 忽略，不会提交到仓库；部署时会随云函数上传）
  try {
    const local = fs.readFileSync(path.join(__dirname, '.apikey'), 'utf8').trim()
    if (local) return local
  } catch (e) { /* 文件不存在则继续 */ }
  try {
    const doc = await db.collection('config').doc('vision').get()
    return (doc.data && doc.data.apiKey) || ''
  } catch (e) {
    return ''
  }
}

// 校验调用者是否为管理员（与 admin 云函数同一套白名单）
async function isAdmin(openid) {
  if (!openid) return false
  try {
    const doc = await db.collection('config').doc('admin').get()
    const list = doc.data && doc.data.openidList
    return Array.isArray(list) && list.includes(openid)
  } catch (e) {
    return false
  }
}

function requestGLM(apiKey, messages, thinking) {
  return new Promise((resolve, reject) => {
    const payload = {
      model: MODEL,
      messages,
      stream: false
    }
    if (thinking) {
      payload.thinking = { type: 'enabled' }
    }
    const body = JSON.stringify(payload)

    const req = https.request(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`响应解析失败: ${data.slice(0, 300)}`))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

exports.main = async (event, context) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()

  try {
    if (action !== 'analyze') {
      return { code: -1, msg: '未知操作' }
    }

    if (!(await isAdmin(OPENID))) {
      return { code: -1, msg: '无权限调用视觉识别' }
    }

    const apiKey = await getApiKey()
    if (!apiKey) {
      return { code: -1, msg: '未配置 API Key：请设置云函数环境变量 ZHIPU_API_KEY，或在 config 集合创建 vision 文档 { apiKey: "..." }' }
    }

    let imageUrl = data.image || ''
    if (imageUrl.startsWith('cloud://')) {
      const res = await cloud.getTempFileURL({ fileList: [imageUrl] })
      imageUrl = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || ''
    }
    if (!imageUrl) {
      return { code: -1, msg: '缺少图片地址（image 字段）' }
    }

    const text = data.prompt || '请描述这张图片的内容'
    const result = await requestGLM(apiKey, [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text }
      ]
    }], data.thinking === true)

    const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content
    if (!content) {
      return { code: -1, msg: result.error ? (result.error.message || '模型调用失败') : '模型未返回内容', raw: result }
    }

    return { code: 0, data: { content } }
  } catch (error) {
    console.error('视觉识别失败:', error)
    return { code: -1, msg: error.message }
  }
}
