# Pixel Agents 课程复习总结

这份文档是我们学习 `pixel-agents` 项目的 20 课复习笔记。它适合后续快速回顾项目结构、关键文件、运行链路和下一步练习方向。

## 一句话理解项目

Pixel Agents 是一个 VS Code 插件。它把 Claude Code 的工作状态变成像素办公室里的小人动画。

也可以这样记：

```text
Claude Code 在工作
        |
        v
Pixel Agents 观察 Claude 的事件和记录
        |
        v
VS Code 面板里的像素小人做出对应动作
```

## 项目大地图

```text
pixel-agents/
  src/          VS Code 插件后端
  webview-ui/   React 前端和 Canvas 像素办公室
  server/       本地 HTTP server 和 hooks 处理
  shared/       共享素材、PNG 解码、manifest 工具
  docs/         项目文档
  e2e/          端到端测试
```

核心分工：

- `src/` 负责 VS Code、终端、agent、文件监听、webview 通信。
- `webview-ui/` 负责界面、Canvas 渲染、办公室状态和编辑器。
- `server/` 负责接收 Claude hooks 发来的实时事件。
- `shared/` 负责多处共用的素材处理逻辑。

## 20 课速记

### 第 1 课：项目是什么

Pixel Agents 是 VS Code 插件，不是普通网页。它把 Claude Code agents 显示成像素办公室里的角色。

### 第 2 课：`package.json`

`package.json` 是项目说明书，记录项目名称、VS Code 插件入口、命令、构建脚本和依赖。

关键点：

- 插件最终入口是 `dist/extension.js`
- 源码入口是 `src/extension.ts`
- 常用命令有 `npm run build`、`npm run test`

### 第 3 课：`src/extension.ts`

这是插件启动入口。VS Code 启动插件时会调用 `activate()`。

它主要做三件事：

- 创建 `PixelAgentsViewProvider`
- 注册 Pixel Agents 面板
- 注册 VS Code 命令

### 第 4 课：`PixelAgentsViewProvider`

它是插件后端的大管家。

负责连接：

- VS Code 面板
- React webview
- 本地 server
- Claude hooks
- agent 生命周期
- 像素素材加载

### 第 5 课：`webview-ui`

这是前端部分，真正显示像素办公室。

入口链路：

```text
webview-ui/index.html
        |
        v
src/main.tsx
        |
        v
<App />
```

### 第 6 课：`postMessage`

前端和插件后端通过消息通信。

```text
前端到后端：vscode.postMessage(...)
后端到前端：webview.postMessage(...)
```

常见消息：

- `webviewReady`
- `openClaude`
- `closeAgent`
- `agentStatus`
- `agentToolStart`
- `layoutLoaded`
- `furnitureAssetsLoaded`

### 第 7 课：`OfficeCanvas`

`OfficeCanvas` 用 HTML Canvas 画像素办公室。

它连接：

- `OfficeState`
- 鼠标交互
- 缩放和平移
- 游戏循环
- `renderFrame`

### 第 8 课：`OfficeState`

`OfficeState` 是办公室的数据大脑。

它保存：

- `layout`
- `tileMap`
- `seats`
- `blockedTiles`
- `furniture`
- `walkableTiles`
- `characters`

### 第 9 课：Claude 事件变动画

核心链路：

```text
Claude 事件
        |
        v
后端解析
        |
        v
webview.postMessage
        |
        v
useExtensionMessages
        |
        v
OfficeState 更新
        |
        v
OfficeCanvas 下一帧画出来
```

### 第 10 课：`agentManager`

`agentManager.ts` 管 agent 生命周期。

主要函数：

- `launchNewTerminal`
- `persistAgents`
- `restoreAgents`
- `removeAgent`
- `sendExistingAgents`
- `sendLayout`

### 第 11 课：`fileWatcher`

`fileWatcher.ts` 负责监听 Claude 的 JSONL 记录文件。

它的任务：

- 找到 JSONL 文件
- 监听新增内容
- 只读取新增行
- 把新行交给 `transcriptParser`

### 第 12 课：`transcriptParser`

`transcriptParser.ts` 是翻译员。

它把 Claude 的 JSONL 记录翻译成前端消息：

- `agentStatus`
- `agentToolStart`
- `agentToolDone`
- `agentToolsClear`
- `agentToolPermission`
- `subagentToolDone`
- `agentTokenUsage`

### 第 13 课：`server/`

`server/` 是本地 HTTP server。

主要接口：

- `GET /api/health`
- `POST /api/hooks/:providerId`

它接收 Claude hook 脚本主动发来的事件。

### 第 14 课：hooks

hooks 是 Claude 主动通知 Pixel Agents 的机制。

路线：

```text
Claude 触发 hook
        |
        v
claude-hook.js
        |
        v
读取 ~/.pixel-agents/server.json
        |
        v
POST 到本地 server
        |
        v
HookEventHandler 处理事件
```

### 第 15 课：素材系统

素材包括：

- 角色
- 地板
- 墙
- 家具
- 默认布局

加载链路：

```text
PNG / manifest JSON
        |
        v
assetLoader
        |
        v
pngDecoder / manifestUtils
        |
        v
webview.postMessage
        |
        v
前端保存并渲染
```

### 第 16 课：布局系统

布局保存办公室地图。

`OfficeLayout` 大致包含：

- `version`
- `cols`
- `rows`
- `tiles`
- `furniture`
- `tileColors`

保存位置：

```text
~/.pixel-agents/layout.json
```

### 第 17 课：编辑模式

编辑模式允许用户：

- 放家具
- 刷地板
- 刷墙
- 擦除
- 移动家具
- 撤销和重做

核心链路：

```text
用户操作
        |
        v
OfficeCanvas 算出格子
        |
        v
useEditorActions 修改 layout
        |
        v
OfficeState.rebuildFromLayout
        |
        v
自动保存 layout
```

### 第 18 课：前端 UI 组件

Canvas 负责画办公室，React UI 负责按钮和弹窗。

常见组件：

- `BottomToolbar`
- `SettingsModal`
- `EditorToolbar`
- `EditActionBar`
- `ToolOverlay`
- `ZoomControls`
- `DebugView`

### 第 19 课：构建和测试

构建命令：

```bash
npm run build
```

它会做：

- TypeScript 类型检查
- ESLint 检查
- esbuild 打包插件后端
- Vite 构建 webview 前端

测试命令：

```bash
npm run test
npm run test:webview
npm run test:server
npm run e2e
```

### 第 20 课：毕业小项目

我们做了一个小改动：

- 文件：`webview-ui/src/components/BottomToolbar.tsx`
- 改动：把按钮 `+ Agent` 改成 `+ Claude Agent`
- 还添加了按钮提示：`Start a new Claude agent`

练习重点：

- 找到组件
- 确认调用链
- 只改 UI 文案
- 不碰业务逻辑
- 检查 diff

## 最重要的完整链路

```text
用户点击 + Claude Agent
        |
        v
BottomToolbar 触发 onOpenClaude
        |
        v
前端发送 openClaude 消息
        |
        v
PixelAgentsViewProvider 收到消息
        |
        v
agentManager.launchNewTerminal
        |
        v
VS Code 创建 Claude Code 终端
        |
        v
Claude 写 JSONL / 触发 hooks
        |
        v
fileWatcher / PixelAgentsServer 收到事件
        |
        v
transcriptParser / HookEventHandler 解析
        |
        v
webview.postMessage 发给前端
        |
        v
useExtensionMessages 更新 OfficeState
        |
        v
OfficeCanvas 画出小人动画
```

## 核心文件复习表

| 文件 | 作用 |
|---|---|
| `package.json` | 项目命令、插件入口、依赖 |
| `src/extension.ts` | VS Code 插件启动入口 |
| `src/PixelAgentsViewProvider.ts` | 插件后端大管家 |
| `src/agentManager.ts` | 管 agent 创建、保存、恢复、关闭 |
| `src/fileWatcher.ts` | 监听 Claude JSONL 文件 |
| `src/transcriptParser.ts` | 解析 JSONL 记录 |
| `src/assetLoader.ts` | 加载素材并发给前端 |
| `src/layoutPersistence.ts` | 保存和读取布局 |
| `server/src/server.ts` | 本地 HTTP server |
| `server/src/hookEventHandler.ts` | 处理 hook 事件 |
| `webview-ui/src/main.tsx` | React 前端入口 |
| `webview-ui/src/App.tsx` | 前端组合根组件 |
| `webview-ui/src/hooks/useExtensionMessages.ts` | 接收后端消息 |
| `webview-ui/src/hooks/useEditorActions.ts` | 编辑模式操作 |
| `webview-ui/src/office/components/OfficeCanvas.tsx` | Canvas 画布和交互 |
| `webview-ui/src/office/engine/officeState.ts` | 办公室状态大脑 |
| `webview-ui/src/office/engine/renderer.ts` | 具体渲染一帧 |
| `webview-ui/src/office/engine/gameLoop.ts` | 游戏循环 |
| `webview-ui/src/office/layout/layoutSerializer.ts` | layout 转地图、家具、座位 |
| `shared/assets/pngDecoder.ts` | PNG 转 SpriteData |
| `shared/assets/manifestUtils.ts` | 家具 manifest 展开 |

## 三个核心概念

### 消息

前端和后端靠 `postMessage` 对话。

### 状态

前端通过 `OfficeState` 保存办公室世界。

### 渲染

`OfficeCanvas` 和 `renderer.ts` 把状态画成像素画面。

## 复习口诀

```text
src 管插件，
server 接事件，
webview-ui 画界面，
OfficeState 存世界，
Canvas 每帧画小人，
postMessage 负责聊天。
```

## 下一阶段练习建议

建议按从简单到稍难的顺序练习：

1. 改一个 UI 文案，比如按钮标题或设置项说明。
2. 加一个只影响前端显示的小提示。
3. 调整一个等待气泡显示时间。
4. 修改一个设置项的默认值。
5. 给 `ToolOverlay` 增加一个小显示字段。
6. 跑一次 `npm run build`，理解失败信息怎么读。
7. 写一个小测试，验证工具状态格式化结果。

## 常用命令

安装依赖：

```bash
npm install
cd webview-ui && npm install && cd ..
cd server && npm install && cd ..
```

构建：

```bash
npm run build
```

测试：

```bash
npm run test
npm run test:webview
npm run test:server
```

端到端测试：

```bash
npm run e2e
```

开发运行：

```text
npm run build
然后在 VS Code 里按 F5
```

## 最后记住

看这个项目时，不要试图一次看懂所有代码。先抓住主链路：

```text
插件启动 -> 前端显示 -> 创建 agent -> 监听 Claude -> 更新状态 -> 画出动画
```

能顺着这条线走，你就已经能读懂这个项目的大部分重要结构了。
