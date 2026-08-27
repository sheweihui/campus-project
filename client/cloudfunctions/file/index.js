const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function normalizeFileIDs(fileIDs) {
  if (!Array.isArray(fileIDs)) return []
  return [...new Set(fileIDs
    .filter(fileID => typeof fileID === 'string' && fileID.startsWith('cloud://'))
    .slice(0, 50))]
}

async function getTempUrls(data = {}) {
  const fileIDs = normalizeFileIDs(data.fileIDs)
  if (fileIDs.length === 0) {
    return { code: 0, data: { urlMap: {} } }
  }

  const res = await cloud.getTempFileURL({ fileList: fileIDs })
  const urlMap = {}
  ;(res.fileList || []).forEach(file => {
    if (file.fileID && file.tempFileURL) {
      urlMap[file.fileID] = file.tempFileURL
    }
  })
  return { code: 0, data: { urlMap } }
}

exports.main = async (event) => {
  const { action, data = {} } = event || {}
  try {
    switch (action) {
      case 'getTempUrls':
        return await getTempUrls(data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    console.error('file 云函数错误:', error)
    return { code: -1, msg: error.message }
  }
}
