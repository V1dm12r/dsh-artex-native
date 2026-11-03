/**
 * Page registry for the native panel.
 *
 * Every entry points at an untouched ARTEX page module (`"use client"` in the
 * originals). Detail pages are registered too but hidden from the nav bar: they
 * are reached by links inside their parent page and read `?id=` from the route.
 */
import type * as React from 'react'

import DashboardPage from '@/app/(main)/dashboard/page'
import ChatPage from '@/app/(main)/chat/page'
import TasksPage from '@/app/(main)/function/tasks/page'
import TasksDetailPage from '@/app/(main)/function/tasks/detail/page'
import FindingsPage from '@/app/(main)/function/findings/page'
import FindingsDetailPage from '@/app/(main)/function/findings/detail/page'
import TrafficPage from '@/app/(main)/function/traffic/page'
import WorkspacePage from '@/app/(main)/function/workspace/page'
import AssetsPage from '@/app/(main)/function/assets/page'
import LlmRecordsPage from '@/app/(main)/function/llm-records/page'
import CommandsPage from '@/app/(main)/function/commands/page'
import SyncPage from '@/app/(main)/function/sync/page'
import LogsPage from '@/app/(main)/system/logs/page'
import LlmPage from '@/app/(main)/system/llm/page'
import AgentsPage from '@/app/(main)/system/agents/page'
import AgentsDetailPage from '@/app/(main)/system/agents/detail/page'
import SkillsPage from '@/app/(main)/system/skills/page'
import ToolsPage from '@/app/(main)/system/tools/page'
import McpPage from '@/app/(main)/system/mcp/page'
import InterceptPage from '@/app/(main)/system/intercept/page'
import InterceptApprovalsPage from '@/app/(main)/system/intercept/approvals/page'
import InterceptAssetsPage from '@/app/(main)/system/intercept/assets/page'
import NotifyPage from '@/app/(main)/system/notify/page'
import SettingsPage from '@/app/(main)/system/settings/page'

export interface PageEntry {
  path: string
  label: string
  component: React.ComponentType
  /** Detail pages are routable but not listed in the nav bar. */
  nav?: boolean
}

export const PAGES: PageEntry[] = [
  { path: '/dashboard', label: '总览', component: DashboardPage },
  { path: '/function/tasks', label: '任务', component: TasksPage },
  { path: '/function/findings', label: '发现', component: FindingsPage },
  { path: '/function/traffic', label: '流量', component: TrafficPage },
  { path: '/function/workspace', label: '工作区', component: WorkspacePage },
  { path: '/function/assets', label: '资产', component: AssetsPage },
  { path: '/function/llm-records', label: 'Token', component: LlmRecordsPage },
  { path: '/function/commands', label: '命令', component: CommandsPage },
  { path: '/function/sync', label: '同步', component: SyncPage },
  { path: '/chat', label: '对话', component: ChatPage },
  { path: '/system/logs', label: '日志', component: LogsPage },
  { path: '/system/llm', label: '模型', component: LlmPage },
  { path: '/system/agents', label: '代理', component: AgentsPage },
  { path: '/system/skills', label: '技能', component: SkillsPage },
  { path: '/system/tools', label: '工具', component: ToolsPage },
  { path: '/system/mcp', label: 'MCP', component: McpPage },
  { path: '/system/intercept', label: '拦截', component: InterceptPage },
  { path: '/system/notify', label: '通知', component: NotifyPage },
  { path: '/system/settings', label: '设置', component: SettingsPage },

  // Routable, reached from links inside their parent page.
  { path: '/function/tasks/detail', label: '任务详情', component: TasksDetailPage, nav: false },
  { path: '/function/findings/detail', label: '发现详情', component: FindingsDetailPage, nav: false },
  { path: '/system/agents/detail', label: '代理详情', component: AgentsDetailPage, nav: false },
  { path: '/system/intercept/approvals', label: '拦截审批', component: InterceptApprovalsPage, nav: false },
  { path: '/system/intercept/assets', label: '资产拦截', component: InterceptAssetsPage, nav: false },
]

export const NAV_PAGES = PAGES.filter((page) => page.nav !== false)

export const DEFAULT_PATH = '/dashboard'

/** Exact path match; the route's query string is handled by useSearchParams. */
export function findPage(pathname: string): PageEntry {
  return PAGES.find((page) => page.path === pathname) ?? PAGES[0]
}
