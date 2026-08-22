// 引入云开发 SDK
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取数据库引用
const db = cloud.database()

// 密码哈希：sha256(密码 + 学号盐)，兼容明文旧数据迁移
function hashPwd(pwd, stuId) {
  return crypto.createHash('sha256').update(String(pwd) + ':' + String(stuId)).digest('hex')
}

function isHashed(str) {
  return typeof str === 'string' && /^[a-f0-9]{64}$/.test(str)
}

function verifyPwd(input, stored, stuId) {
  if (isHashed(stored)) {
    return hashPwd(input, stuId) === stored
  }
  // 旧数据是明文，直接比较
  return input === stored
}

/**
 * 学号登录云函数
 * action: login
 * data: { stuId, name, phone, pwd }
 */
async function studentLogin(OPENID, data) {
  const { stuId, name, phone, pwd } = data

  try {
    // 1. 查询学号是否存在
    const queryResult = await db.collection('student')
      .where({
        stuId: stuId
      })
      .field({
        stuId: true,
        name: true,
        phone: true,
        pwd: true,
        openid: true
      })
      .get()

    // 2. 学号不存在
    if (queryResult.data.length === 0) {
      return {
        code: -1,
        msg: '该学号未录入，请联系管理员'
      }
    }

    // 3. 获取学生记录
    const student = queryResult.data[0]
    const _id = student._id

    // 4. 姓名校验：数据库中已有姓名时，必须与输入一致
    if (student.name && student.name !== '') {
      if (student.name !== name) {
        return {
          code: -1,
          msg: '姓名与学号不匹配'
        }
      }
    }

    // 5. 首次登录（无密码）：自动初始化信息并登录
    if (!student.pwd || student.pwd === '') {
      const updateData = {
        name: name,  // 更新姓名（覆盖或新增）
        pwd: hashPwd(pwd, stuId),  // 只存哈希，不存明文
        openid: OPENID,  // 保存 openid
        lastLoginTime: db.serverDate()
      }

      // 如果提供了手机号则更新
      if (phone && phone !== '') {
        updateData.phone = phone
      }

      await db.collection('student').doc(_id).update({
        data: updateData
      })

      return {
        code: 0,
        msg: '首次登录，信息已初始化',
        data: {
          stuId: stuId,
          name: name,
          phone: phone || '',
          isFirstLogin: true
        }
      }
    }

    // 6. 已有密码：校验密码（兼容哈希存储与旧明文数据）
    if (!verifyPwd(pwd, student.pwd, stuId)) {
      return {
        code: -1,
        msg: '密码错误，请重新输入'
      }
    }

    // 7. 密码正确：检查手机号是否缺失，缺失则更新
    const updateData = {
      lastLoginTime: db.serverDate()
    }

    // 旧数据为明文密码：登录成功后升级为哈希存储
    if (!isHashed(student.pwd)) {
      updateData.pwd = hashPwd(pwd, stuId)
    }

    // 如果 openid 不存在，保存 openid
    if (!student.openid) {
      updateData.openid = OPENID
    }

    // 如果手机号缺失，更新手机号
    if (!student.phone && phone) {
      updateData.phone = phone
    }

    await db.collection('student').doc(_id).update({
      data: updateData
    })

    // 8. 返回登录成功信息
    return {
      code: 0,
      msg: '登录成功',
      data: {
        stuId: student.stuId,
        name: student.name,
        phone: student.phone || phone || '',
        isFirstLogin: false
      }
    }

  } catch (error) {
    console.error('登录云函数错误:', error)
    return {
      code: -1,
      msg: '服务器异常，请稍后重试'
    }
  }
}

// 导出云函数
exports.main = async (event, context) => {
  const { action, data = {} } = event
  
  // 获取 openid
  const OPENID = cloud.getWXContext().OPENID

  try {
    switch (action) {
      case 'login':
        return await studentLogin(OPENID, data)
      case 'getInfo':
        return await getStudentInfo(OPENID, data)
      default:
        return { code: -1, msg: '未知操作' }
    }
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}

async function getStudentInfo(OPENID, data) {
  const { stuId } = data

  try {
    const result = await db.collection('student')
      .where({ stuId })
      .field({
        stuId: true,
        name: true,
        phone: true,
        openid: true
      })
      .get()

    if (result.data.length === 0) {
      return { code: -1, msg: '用户不存在' }
    }

    const student = result.data[0]

    // 归属校验：只有本人可查看完整信息（姓名/手机号/openid），他人只能看到姓名
    let isSelf = false
    if (OPENID) {
      try {
        const me = await db.collection('student')
          .where({ openid: OPENID })
          .field({ stuId: true })
          .get()
        isSelf = me.data.length > 0 && me.data[0].stuId === stuId
      } catch (e) {
        isSelf = false
      }
    }

    if (!isSelf) {
      return {
        code: 0,
        data: {
          stuId: student.stuId,
          name: student.name
        }
      }
    }

    return {
      code: 0,
      data: {
        stuId: student.stuId,
        name: student.name,
        phone: student.phone,
        openid: student.openid  // 返回 openid
      }
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return { code: -1, msg: '获取用户信息失败' }
  }
}
