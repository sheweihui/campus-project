# 校园便利圈 - 微信小程序

## 项目简介

校园便利圈是一款为大学生打造的便民服务小程序，提供失物招领、二手集市、校园互助、校园工具等功能，帮助同学们解决校园生活中的各种需求。

## 技术栈

- 框架：Vue 2 + uniCloud
- 开发工具：微信开发者工具
- 后端：微信云开发（云数据库 + 云函数）

## 项目结构

```
校园便利圈/
├── pages/                    # 页面目录
│   ├── index/               # 首页
│   ├── lostfound/           # 失物招领模块
│   │   ├── lostfound        # 失物招领列表
│   │   ├── publish          # 发布失物/拾获信息
│   │   ├── detail           # 详情页
│   │   └── mylist           # 我的发布
│   ├── market/              # 二手集市模块
│   │   ├── market           # 商品列表
│   │   ├── publish          # 发布商品
│   │   ├── detail           # 详情页
│   │   └── mylist           # 我的发布
│   ├── help/                # 校园互助模块
│   │   ├── help             # 互助首页
│   │   ├── carpool          # 拼车出行
│   │   ├── express          # 代取快递
│   │   ├── partner          # 找搭子
│   │   ├── publish          # 发布互助信息
│   │   └── detail           # 详情页
│   ├── tools/               # 校园工具模块
│   │   ├── tools            # 工具首页
│   │   ├── classroom        # 空教室查询
│   │   ├── calendar         # 校历考试
│   │   └── map              # 校园地图
│   └── profile/             # 个人中心模块
│       ├── profile          # 个人中心
│       ├── edit             # 编辑资料
│       ├── messages         # 消息通知
│       └── settings         # 设置与反馈
├── cloudfunctions/          # 云函数目录
│   ├── lostfound/           # 失物招领云函数
│   ├── market/              # 二手集市云函数
│   ├── help/                # 校园互助云函数
│   └── user/                # 用户相关云函数
├── database/                # 云数据库schema
│   ├── lostfound.schema.json
│   ├── market.schema.json
│   ├── help-carpool.schema.json
│   ├── help-express.schema.json
│   ├── help-partner.schema.json
│   ├── users.schema.json
│   └── messages.schema.json
├── utils/                   # 工具函数
│   └── util.js
├── static/                  # 静态资源
│   └── images/              # 图片资源
├── app.js                   # 小程序入口文件
├── app.json                 # 小程序配置文件
├── app.wxss                 # 全局样式文件
└── sitemap.json             # 站点地图配置
```

## 核心功能

### 1. 失物招领
- 我要寻物：发布寻物信息（物品名称、描述、丢失时间/地点、联系方式、图片）
- 我要归还：发布拾获信息（物品名称、描述、拾获时间/地点、联系方式、图片）
- 历史记录：查看自己发布的寻物/归还记录，可编辑/删除

### 2. 二手集市
- 发布二手：发布商品（名称、价格、分类、成色、描述、图片、联系方式）
- 分类浏览：按分类筛选商品，支持关键词搜索，点击查看详情
- 我的发布：查看自己发布的二手商品，可编辑/下架

### 3. 校园互助
- 拼车出行：发布/查看拼车需求（出发地/目的地、时间、人数、联系方式）
- 代取快递：发布/查看代取需求（取件码、收件人、地址、酬金、截止时间）
- 找搭子：发布/查看搭子需求（类型：自习/运动/吃饭、时间、地点、人数、联系方式）

### 4. 校园工具
- 空教室查询：按楼栋/时间段查询空教室
- 校历/考试安排：展示校历和考试时间
- 校园地图：展示校园地图，支持地点搜索

### 5. 个人中心
- 个人信息：展示/编辑昵称、头像、学号
- 我的发布：汇总展示所有模块的发布记录
- 消息通知：接收系统/他人的消息提醒
- 设置与反馈：修改账号设置、提交反馈

## 云数据库表结构

### lostfound（失物招领）
- type: 'lost' | 'found'（寻物/归还）
- title: 标题
- description: 描述
- time: 时间
- location: 地点
- contact: 联系方式
- images: 图片数组
- openid: 发布者openid
- createTime: 创建时间

### market（二手集市）
- title: 标题
- price: 价格
- category: 分类（书籍/数码/生活用品）
- condition: 成色（new/likeNew/good/fair）
- description: 描述
- images: 图片数组
- contact: 联系方式
- openid: 发布者openid
- status: 状态（active/sold）
- createTime: 创建时间

### help-carpool（拼车出行）
- from: 出发地
- to: 目的地
- time: 时间
- people: 人数
- contact: 联系方式
- remark: 备注
- status: 状态（active/completed）
- openid: 发布者openid
- createTime: 创建时间

### help-express（代取快递）
- pickupCode: 取件码
- recipient: 收件人
- address: 地址
- reward: 酬金
- deadline: 截止时间
- contact: 联系方式
- remark: 备注
- status: 状态（pending/accepted/completed）
- openid: 发布者openid
- createTime: 创建时间

### help-partner（找搭子）
- partnerType: 类型（study/sport/eat/game/travel/others）
- time: 时间
- location: 地点
- people: 人数
- description: 描述
- contact: 联系方式
- status: 状态（active/completed）
- openid: 发布者openid
- createTime: 创建时间

### users（用户信息）
- openid: 用户openid
- nickName: 昵称
- avatarUrl: 头像
- studentId: 学号
- phone: 手机号
- createTime: 创建时间

### messages（消息通知）
- toOpenid: 接收者openid
- fromOpenid: 发送者openid
- type: 类型（system/user）
- title: 标题
- content: 内容
- isRead: 是否已读
- createTime: 创建时间

## 云函数说明

### lostfound
- list: 获取失物招领列表
- detail: 获取详情
- add: 添加失物招领
- update: 更新失物招领
- delete: 删除失物招领
- mylist: 获取我的发布列表

### market
- list: 获取商品列表
- detail: 获取详情
- add: 添加商品
- update: 更新商品
- delete: 删除商品
- mylist: 获取我的发布列表

### help
- list: 获取互助信息列表
- detail: 获取详情
- add: 添加互助信息
- update: 更新互助信息
- delete: 删除互助信息
- updateStatus: 更新状态
- mylist: 获取我的发布列表

### user
- getStats: 获取统计数据
- update: 更新用户信息

## 使用说明

1. 使用微信开发者工具打开项目
2. 在云开发控制台创建云环境
3. 上传云函数并部署
4. 在云数据库中创建对应的集合
5. 配置云数据库schema
6. 在app.js中配置云环境ID
7. 编译运行小程序

## 注意事项

1. 需要配置云开发环境ID
2. 需要创建云数据库集合并配置schema
3. 需要上传并部署云函数
4. 图片资源需要自行准备或使用占位图
5. 测试时需要使用微信开发者工具的测试账号

## 版本信息

- 版本：1.0.0
- 更新日期：2026-03-29