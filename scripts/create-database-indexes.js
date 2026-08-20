const fs = require('fs')
const path = require('path')

let CloudBase
try {
  const CloudBaseModule = require('@cloudbase/manager-node')
  CloudBase = CloudBaseModule.default || CloudBaseModule
} catch (error) {
  console.error('缺少依赖 @cloudbase/manager-node，请先执行：npm install')
  process.exit(1)
}

const rootDir = path.resolve(__dirname, '..')
const indexFile = process.env.CLOUDBASE_INDEX_FILE
  ? path.resolve(process.env.CLOUDBASE_INDEX_FILE)
  : path.join(rootDir, 'client', 'database-indexes.json')

const secretId = process.env.TENCENTCLOUD_SECRET_ID
const secretKey = process.env.TENCENTCLOUD_SECRET_KEY

if (!secretId || !secretKey) {
  console.error('请先设置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY 环境变量')
  process.exit(1)
}

function readConfig() {
  const config = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  const envId = process.env.CLOUDBASE_ENV_ID || config.envId
  if (!envId) {
    throw new Error('缺少 envId，请在 database-indexes.json 或 CLOUDBASE_ENV_ID 中配置')
  }
  if (!Array.isArray(config.indexes) || config.indexes.length === 0) {
    throw new Error('database-indexes.json 中没有 indexes 配置')
  }
  return { envId, indexes: config.indexes }
}

function toDirection(order) {
  return String(order || 'asc').toLowerCase() === 'desc' ? '-1' : '1'
}

function toCreateIndex(index) {
  return {
    IndexName: index.name,
    MgoKeySchema: {
      MgoIsUnique: !!index.unique,
      MgoIndexKeys: index.fields.map(field => ({
        Name: field.field,
        Direction: toDirection(field.order)
      }))
    }
  }
}

function groupByCollection(indexes) {
  return indexes.reduce((groups, index) => {
    if (!index.collection || !index.name || !Array.isArray(index.fields)) {
      throw new Error(`索引配置不完整：${JSON.stringify(index)}`)
    }
    groups[index.collection] = groups[index.collection] || []
    groups[index.collection].push(toCreateIndex(index))
    return groups
  }, {})
}

async function ensureCollection(database, collectionName) {
  try {
    if (typeof database.createCollectionIfNotExists === 'function') {
      await database.createCollectionIfNotExists(collectionName)
    } else {
      await database.createCollection(collectionName)
    }
    console.log(`已确认集合：${collectionName}`)
  } catch (error) {
    const message = error && (error.message || error.Message || '')
    if (!/exist|exists|已存在|存在/i.test(message)) {
      console.warn(`确认集合 ${collectionName} 时出现提示：${message || error}`)
    }
  }
}

async function main() {
  const { envId, indexes } = readConfig()
  const manager = new CloudBase({ secretId, secretKey, envId })
  const { database } = manager
  const grouped = groupByCollection(indexes)

  console.log(`环境：${envId}`)
  console.log(`索引清单：${indexFile}`)

  for (const [collectionName, createIndexes] of Object.entries(grouped)) {
    await ensureCollection(database, collectionName)
    console.log(`开始处理集合 ${collectionName}，索引数量：${createIndexes.length}`)
    await database.updateCollection(collectionName, { CreateIndexes: createIndexes })
    console.log(`完成集合 ${collectionName}`)
  }

  console.log('全部索引创建任务已提交')
}

main().catch(error => {
  console.error(error && (error.stack || error.message) || error)
  process.exit(1)
})
