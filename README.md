# 系规练习簿

项目简介：

面向系统规划与管理师备考的个人学习工具，根据个人学习习惯把教材、章节题、作答记录和个人笔记放在同一个界面中，减少开始学习前的准备阶段。

项目背景：

在工作之余进行备考，时间精力都十分有限，在学习的过程中发现每次开始都需要打开对应的教材翻到对应页面、打开另一本练习题、打开笔记软件。做题的时候如果直接看带答案版本会被干扰、看无答案版本又需要再打开一本答案、复盘还需要打开对应的教材，所以尝试用codex给自己手搓了一个小工具辅助自己（从自己用的版本用ai拆分出来的，暂时没时间去测试了，所以感兴趣的小伙伴可以自己试一下给我个反馈，如果细节部分有问题可以自己尝试用codex、workbuddy等ai工具自行微调一下）。

因为出发点是个人使用，所以对于部分存在问题的功能细节并没有修改，暂时只保障了主干的功能可以使用，目前已经依靠这个小工具完成了17章的综合知识学习，做了一遍真题大概48分左右，已经开始案例分析继续巩固了，案例分析可能还在摸索其他备考方式。（目前准备搭建个知识库记录自己学习内容，感兴趣可以一起看一下： https://my.feishu.cn/wiki/EDnLwx7NTip2jjk5MMvcJSVSnRh?from=from_copylink ）

<img width="1506" height="719" alt="image" src="https://github.com/user-attachments/assets/7f134410-9471-4b76-97c4-5429e7913ce1" />

## 功能

- 按教材章节学习，默认从题库中第一个有题目的小节开始。
- 学习模式与闭卷刷题模式，分别记录掌握证据。【学习模式最好用，直接点进去直接到对应章节辅导教材及对应习题】
- 自动保存当前题号、答案、教材页码和学习用时。
- 章节目录、薄弱点复习和小节完成报告。
- 学习中生成可编辑的结构化笔记草稿，确认后保存为个人笔记。
- 空白个人计划，可自行添加、拖动、拆分和锁定任务。【不好用，可以先忽略】
- 可选考试倒计时。
- 本地 JSON 数据、自动迁移备份和手动备份。

项目内保留整理后的章节题库，但不包含教材 PDF 和教材页面图片。新用户的学习记录、计划和笔记均为空。

## 使用边界

- 单个实例只供一个人使用。
- 应在个人电脑、家庭网络或自己的私有服务器上运行。
- 应用没有登录和权限隔离，不要把端口直接暴露到公网。
- 教材定位按当前题库对应的教材版本整理，使用其他版本时页码可能不一致。

# 使用方式
可以直接拉项目按照下面的方式配置，对于不会配置的小伙伴，可以直接把整个项目的链接丢给ai进行本地安装部署。

## 环境要求

- Node.js 22.13 或更高版本。
- npm。
- 阅读教材页面时需要自行准备与题库匹配的教材 PDF。
- 生成 WebP 页面需要 Python 3、Pillow 和 Poppler 的 `pdftoppm`。

macOS 可安装 Poppler：

```bash
brew install poppler
```

Ubuntu/Debian 可安装：

```bash
sudo apt-get install poppler-utils
```

## 本机快速开始

安装依赖并创建本地配置：

```bash
npm install
cp .env.example .env
```

把教材复制为：

```text
materials/textbook.pdf
```

生成学习区使用的页面图片：

```bash
python3 -m pip install -r scripts/requirements-render.txt
npm run render:textbook-pages -- materials/textbook.pdf materials/pages
```

启动应用：

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`。第一次打开时会自动创建空白的 `data/state.json`，并从题库第一个有效小节开始。

如果暂时没有教材文件，题库仍可用于答题；教材页面和完整 PDF 功能不可用。

## Docker 运行

先准备 `materials/textbook.pdf` 和 `materials/pages/`，然后执行：

```bash
cp .env.example .env
docker compose up -d --build
```

打开 `http://localhost:3000`。`data/` 会挂载到容器外，重新构建镜像不会覆盖个人进度。

服务器部署参见 [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md)。

## 配置

配置写入 `.env`，该文件已被 Git 忽略。

| 变量 | 用途 | 默认行为 |
| --- | --- | --- |
| `EXAM_DATE` | 首页考试倒计时，接受 ISO 日期时间 | 留空时隐藏倒计时 |
| `TEXTBOOK_PATH` | 本机运行时的教材 PDF | `materials/textbook.pdf` |
| `TEXTBOOK_PAGES_PATH` | 本机运行时的教材页面目录 | `materials/pages` |
| `STUDYBOOK_DATA_DIR` | 个人状态和备份目录 | `data` |
| `STUDYBOOK_CONTENT_DIR` | 只读题库目录 | `content` |
| `XIGUI_TEXTBOOK_PATH` | Docker 使用的宿主机教材路径 | `./materials/textbook.pdf` |
| `XIGUI_TEXTBOOK_PAGES_DIR` | Docker 使用的宿主机页面目录 | `./materials/pages` |
| `XIGUI_DATA_DIR` | Docker 使用的个人数据目录 | `./data` |
| `XIGUI_HOST_PORT` | 服务器 Compose 的回环端口 | `3100` |

修改 `EXAM_DATE` 后，本机开发服务器需要重启；Docker 用户重新执行 `docker compose up -d` 让容器读取新配置即可，无需重新构建镜像。

## 数据目录

```text
content/
└── catalog.json       # 随项目发布的只读章节与题库

data/
├── state.json         # 个人会话、作答、计划和笔记，首次运行生成
└── backups/           # 状态迁移或手动备份

materials/
├── textbook.pdf       # 用户自行准备，不进入 Git
└── pages/              # 用户本地生成，不进入 Git
```

题库内容和个人数据已分离。挂载空白 `data/` 目录不会隐藏题库。

## 备份与升级

手动备份：

```bash
npm run backup:data -- before-upgrade
```

升级前建议复制整个 `data/` 目录。更新代码后重新安装依赖或构建容器，应用会在需要时迁移旧版状态，并先留下迁移前备份。

## 开发检查

```bash
npm test
npm run lint
npm run build
```

## 当前限制

- 不支持多人共用同一个实例。
- 不提供跨设备实时同步。
- 教材与题库的页码映射针对当前资料版本。
- 题库仍有少量人工校对项，遇到问题可以在题目页面提交本地校验记录。
- 计划功能从空白开始，不提供统一备考时间表或阶段规划。

## 许可证与内容声明

本项目原创程序代码和项目文档采用 [MIT License](LICENSE)。题库不自动适用 MIT License，具体边界见 [CONTENT_NOTICE.md](CONTENT_NOTICE.md)。教材 PDF 和渲染页面不应提交到仓库。
