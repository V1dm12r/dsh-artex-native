# DSH ARTEX Native

把 [ARTEX](https://github.com/Autumn-27/ARTEX) 的 Web 前端接入 **DeepSeek Harness**，作为**原生 React 组件**渲染 —— 不是 iframe。

因为 DOM 直接在宿主页面里，DSH 的壁纸、主题、玻璃效果都能透出来；这是 iframe 方案做不到的。

> **许可证**：AGPL-3.0。本插件包含 ARTEX 的前端源码副本（`artex-src/`），ARTEX 采用 AGPL-3.0，因此本插件整体也必须是 AGPL-3.0，详见文末。

---

## 它解决什么问题

原来的 iframe 方案里，ARTEX 页面是一块不透明的白/黑矩形，把 DSH 的壁纸完全盖住。原因是 iframe 是独立文档，宿主 CSS 进不去。

这个插件把 ARTEX 的 React 组件直接挂进 DSH 的 slot，于是：

- 壁纸从面板背景透出（卡片做成半透明）
- 跟随 DSH 的深色主题
- 没有第二套文档、没有跨文档的样式断层

---

## 架构

```
┌─ DSH 页面 ──────────────────────────────────────────────────┐
│                                                              │
│  ARTEX 原生（main slot，由宿主 React 渲染外壳）                │
│   └─ Shadow DOM                                             │
│       └─ <div class="dark">      ← ARTEX 深色调色板           │
│           ├─ NavBar              ← 19 个标签（内存路由）       │
│           ├─ <ARTEX 页面组件>     ← 原样复用                   │
│           └─ Radix Portal 容器    ← 下拉/弹窗挂这里             │
│                                                              │
│  组件请求 → 相对路径 /artex-api/*                              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌─ DSH Host 进程 ─────────────────────────────────────────────┐
│  index.js: webServer.register({ kind:'prefix', path:'/artex-api' }) │
│  → http.request 流式转发 → <artexUrl>/api/*                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌─ ARTEX 后端（Docker，默认 127.0.0.1:8787）───────────────────┐
│  Go 服务；前端虽然也编译在里面，但插件只调用它的 API             │
└──────────────────────────────────────────────────────────────┘
```

### 六个关键设计

| 决策 | 原因 |
|---|---|
| **不用 iframe** | 只有 DOM 在宿主里，壁纸才能透出来 |
| **Shadow DOM 隔离** | ARTEX 的 Tailwind 与 DSH 的 `--dsw-*` token 互不污染 |
| **宿主组件用 class** | 外壳由 **DSH 的 React** 渲染，内部用 **bundle 自带的 React**；函数组件的 hooks 跨实例会抛 `Invalid hook call`，class 只依赖 `prototype.isReactComponent` |
| **Portal 重定向** | Radix 默认把弹层塞进 `document.body`，跑出 Shadow DOM 就丢样式 |
| **代理前缀 `/artex-api`** | 直接占 `/api` 会和 DSH 自己的路由冲突 |
| **401 只发事件不跳页** | ARTEX 原生代码是 `location.href = "/login"`，在 DSH 里会把整个应用跳到 404 |

---

## 安装

> `dist/` 和 `node_modules/` 都在 `.gitignore` 里。从仓库 clone 下来后**先构建一次**（见下节），再安装。

```bash
# 1. 构建（首次约 1 分钟）
.\build.ps1

# 2. 装 bundle（指向本目录）
plugin_manager install_bundle  <本目录绝对路径>

# 3. 重启 DSH（Client 模块按 generation 缓存）
```

重启后侧栏出现 **ARTEX 原生**。

### 配置后端地址

**插件页 → ARTEX 原生 → 添加的组件那一行 → 配置**

地址格式：`http://127.0.0.1:8787`（支持省略协议：`10.0.0.5:9000`）。

改完**必须点「保存」** —— 代理读的是 `apply(ctx, config)` 拿到的值。

### 登录

面板首次进入会显示登录框：

- 用户名固定 `ARTEX`（后端写死）
- 密码与 Docker 里一致
- JWT 存 `localStorage.artex_token`，7 天有效；过期会自动弹回登录框

---

## 构建

物理机不需要 `node_modules`，依赖装在 Docker volume 里。

```powershell
.\build.ps1
```

首次约 1 分钟（拉依赖），之后约 30 秒。

清理依赖缓存：

```powershell
docker volume rm artex-native-node-modules
```

> 注意：Docker 挂载 volume 时会在工作区生成一个空的 `node_modules` 目录，删掉即可，不影响下次构建。

---

## 对 ARTEX 前端的改动

所有改动都在 `artex-src/`（ARTEX `web/src` 的副本），**上游仓库不受影响**。共 15 个文件：

### 1. Portal 容器（13 个 UI 组件）

`components/ui/` 下的 `alert-dialog` `combobox` `context-menu` `dialog` `drawer` `dropdown-menu` `hover-card` `menubar` `popover` `select` `sheet` `tooltip`：

```diff
-<SelectPrimitive.Portal>
+<SelectPrimitive.Portal container={portalContainer()}>
```

没有这一步，下拉/弹窗会渲染到 `document.body`，跑出 Shadow DOM 后丢失样式 —— 表现为「文字叠在一起」。

`combobox` 因为本来就有 `container` prop，单独处理成 `container={portalContainer ?? defaultPortalContainer()}`。

### 2. 新增 `lib/portal-root.ts`

共享的 portal 挂载点：面板在 shadow 内创建一个 `display: contents` 容器，所有 Portal 指向它。

### 3. `lib/api.ts`

```diff
-const r = await fetch(`/api${path}`, ...)
+const r = await fetch(`/artex-api${path}`, ...)
```

共 7 处，含 `sseUrl()`。401 分支改成派发事件，不再跳页。

### 4. `components/calendar/event-calendar-views.tsx`

删掉了 `import '@fullcalendar/react/skeleton.css'`。这是一条普通 CSS import，Vite 会把它提取成独立 `.css` 文件，而宿主只加载 `client.js`，那个文件永远不会被请求。该组件当前无人引用，所以直接去掉；将来启用日历需要改成 `?inline` 并注入 shadow。

---

## 本插件的三个坑（复现时注意）

### 1. `process is not defined`

ARTEX 是 Next.js 应用，`process.env.NEXT_PUBLIC_*` 由 Next 在构建时内联。Vite 不会，浏览器也没有 `process`：

```js
const cp = process.env.NEXT_PUBLIC_MOCK === "1"   // 抛错 → 整个 Client boot 失败
```

解法：`define` 内联这两个变量 + `output.banner` 注入 `process` 兜底 shim。

### 2. 测试方法骗了自己

用 jsdom + `new Function` 验证时，代码跑在 **Node 全局作用域**，Node 天生有 `process`，把坑 1 完美掩盖。真正的验证要用 `vm.createContext` 造一个没有 `process` 的沙箱（见 `test-vm.mjs`）。

### 3. React 双实例

`ArtexPanel` 被注册进 DSH 的 slot，由**宿主 React** 渲染；但它内部用了 **bundle 自带 React** 的 `useRef`/`useEffect`。两个调度器不匹配 → `Invalid hook call` → 面板空白。

解法：面向宿主的组件一律用 **class 组件**（`ArtexPanel`、`ArtexConfigForm` 都是）。Shadow DOM 内部可以放心用 hooks。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| **bundle 3.9 MB** | 19 个页面 + React + Tailwind + 图表库全打在一起，首次加载偏慢 |
| 详情页路由简化 | `useParams()` 返回 `{}`；详情页靠 `?id=` 查询参数（与 ARTEX 原实现一致） |
| 强制深色 | `themeMode` 固定 `dark`，不跟随 DSH 切浅色 |
| 字体回退 | `html[data-font=...]` 选择器在 Shadow DOM 内不匹配，字体退化为系统字体 |
| 切页丢状态 | 页面切换会重新挂载 |
| ARTEX 自动更新失效 | 后端 `selfupdate/github.go` 的 `Repo` 常量指向已 404 的作者仓库；不影响面板使用 |

---

## 许可证

ARTEX 采用 **GNU Affero General Public License v3.0**。本插件包含其前端源码副本（`artex-src/`）并与之链接，因此同样以 **AGPL-3.0** 发布。

分发本插件（包括以 SaaS 形式提供）时，必须同时提供完整源码，并保留原作者的版权声明。上游仓库：<https://github.com/Autumn-27/ARTEX>

### 第三方组件

`vendor/` 下的两个包原样引入（仅把彼此的 import 改成相对路径，以便脱离 `node_modules`）：

| 包 | 版本 | 许可证 | 许可证文件 |
|---|---|---|---|
| `@deepseek-ai/schemastery` | 3.18.5 | MIT | `vendor/schemastery.LICENSE` |
| `@deepseek-ai/cosmokit` | 1.8.6 | MIT | `vendor/cosmokit.LICENSE` |

用途：声明 DSH 插件配置（`export const Config`）。DSH 只识别 schemastery Schema，手写的描述对象会被判为 `unsupported`。
