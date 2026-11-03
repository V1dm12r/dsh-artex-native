# Changelog

## [0.1.0] - 2026-11-03

首个可发布版本。ARTEX 前端以原生 React 组件接入 DSH，不再使用 iframe。

### 功能

- 19 个主导航页面 + 5 个详情页（任务 / 发现 / 代理 等）
- `/artex-api/*` 反向代理到 Docker 后端，地址可在插件设置中修改
- 登录门（JWT 存 `localStorage.artex_token`），401 不跳页
- 插件行配置界面（修改后端地址）
- 后端不可达时显示状态页，可重试

### 修复

- **Shadow DOM 内的第三方 CSS**：普通 `import` 的样式进 `document.head`，shadow root
  无法看到。React Flow 因此丢失全部样式，画布定位错误、节点跑到可视区外、缩放失效。
  改为 `?inline` 拼进 shadow 样式表，并补回上游缺失的 `.react-flow { position: relative }`。
- **`SidebarProvider` 撑破布局**：其 `min-h-svh` 包装层导致面板空白，改用 `display: contents`。
- **`fitView` 首帧测量错误**：在布局稳定后重新调用。
- **弹层关闭按钮与宿主窗口控件重叠**：`top-3` → `top-12`。
- **图谱背景遮挡壁纸**：React Flow 与 G6 的画布背景改为透明。
- **源码中的真实 NUL 字节**：使 Git 将文件判定为二进制、diff 不可见，改为 `\u0000` 转义。

### 对 ARTEX 前端的改动（15 个文件）

- 13 个 Radix 弹层组件：`<XPrimitive.Portal container={portalContainer()}>`
- `lib/api.ts`：请求前缀 `/artex-api`、401 改为派发 `artex:unauthorized` 事件、`sseUrl()` 重写
- `lib/portal-root.ts`：新增，共享 portal 挂载点
- `components/calendar/event-calendar-views.tsx`：移除无引用的 fullcalendar CSS import

### 已知限制

- bundle 3.9 MB，未做代码分割
- 详情页 `useParams()` 返回空对象，依赖 `?id=` 查询参数
- 强制深色主题
- 字体回退为系统字体
- 切换页面会丢失组件状态

### 许可证

AGPL-3.0。本插件包含 ARTEX 前端源码副本。