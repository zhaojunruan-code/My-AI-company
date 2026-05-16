import type { Language } from './i18n.js';

interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogContributor {
  name: string;
  url: string;
  description: string;
}

interface ChangelogEntry {
  version: string;
  sections: ChangelogSection[];
  contributors: ChangelogContributor[];
}

/** Extract "major.minor" from a semver string (e.g. "1.1.1" → "1.1") */
export function toMajorMinor(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

export const CHANGELOG_REPO_URL = 'https://github.com/pablodelucca/pixel-agents';

export const changelogEntries: ChangelogEntry[] = [
  {
    version: '1.3',
    sections: [
      {
        title: 'Features',
        items: [
          'Hooks-first session management with dual-mode architecture (hooks + heuristic fallback)',
          'Claude Code hooks for instant agent status detection',
          'External session support and Agent tool recognition',
          'Multi-root workspace agent detection across all workspace folders',
          'Load custom characters from external asset directories',
          'Tailwind CSS v4 migration for the webview UI',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Prevent duplicate restores, fix tool status reconnect, improve agent tool detection',
        ],
      },
      {
        title: 'Maintenance',
        items: [
          'Add shared/ to lint, format, and lint-staged',
          'Dependabot dev-dependency group bumps',
        ],
      },
    ],
    contributors: [
      {
        name: '@drewf',
        url: 'https://github.com/drewf',
        description: 'External session support and Agent tool recognition',
      },
      {
        name: '@Commandershadow9',
        url: 'https://github.com/Commandershadow9',
        description: 'Multi-root workspace agent detection',
      },
      {
        name: '@mitre88',
        url: 'https://github.com/mitre88',
        description: 'Duplicate restore, tool status reconnect, tool detection fixes',
      },
      {
        name: '@noam971',
        url: 'https://github.com/noam971',
        description: 'Duplicate restore, tool status reconnect, tool detection fixes',
      },
      {
        name: '@itsManeka',
        url: 'https://github.com/itsManeka',
        description: 'Custom characters from external asset directories',
      },
      {
        name: '@pablodelucca',
        url: 'https://github.com/pablodelucca',
        description: 'Claude Code hooks integration, Tailwind v4 migration',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Claude Code hooks integration, Tailwind v4 migration',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Hooks-first dual-mode architecture, review coordination',
      },
    ],
  },
  {
    version: '1.2',
    sections: [
      {
        title: 'Features',
        items: [
          'Bypass permissions mode — right-click "+ Agent" to skip tool approvals',
          'External asset packs — load furniture from user-defined directories',
          'Improved seating, sub-agent spawning, and background agent support',
          'Always show overlay setting for agent labels',
          'Agent connection diagnostics and JSONL parser resilience',
          'Browser preview mode for development and review',
        ],
      },
      {
        title: 'Fixes',
        items: ['Agents not appearing on Linux Mint/macOS when no folder is open'],
      },
      {
        title: 'Testing',
        items: ['Playwright e2e tests with mock Claude CLI'],
      },
      {
        title: 'Maintenance',
        items: [
          'Bump Vite 8.0, ESLint 10, and various dependency updates',
          'CI improvements for Dependabot and badge updates',
        ],
      },
    ],
    contributors: [
      {
        name: '@marctebo',
        url: 'https://github.com/marctebo',
        description: 'External asset packs support',
      },
      {
        name: '@dankadr',
        url: 'https://github.com/dankadr',
        description: 'Bypass permissions mode',
      },
      {
        name: '@d4rkd0s',
        url: 'https://github.com/d4rkd0s',
        description: 'Linux/macOS fix for no-folder workspaces',
      },
      {
        name: '@daniel-dallimore',
        url: 'https://github.com/daniel-dallimore',
        description: 'Always show overlay setting',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Playwright e2e tests, browser preview mode',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Agent diagnostics, JSONL resilience, CI improvements',
      },
    ],
  },
];

const zhChangelogEntries: ChangelogEntry[] = [
  {
    version: '1.3',
    sections: [
      {
        title: '新功能',
        items: [
          'Hooks 优先的会话管理，并提供双模式架构（Hooks + 启发式回退）',
          '通过 Claude Code Hooks 即时检测 agent 状态',
          '支持外部会话并识别 Agent 工具',
          '跨所有工作区文件夹检测多根工作区 agent',
          '从外部素材目录加载自定义角色',
          'Webview UI 迁移到 Tailwind CSS v4',
        ],
      },
      {
        title: '修复',
        items: ['防止重复恢复，修复工具状态重连，并改进 agent 工具检测'],
      },
      {
        title: '维护',
        items: ['将 shared/ 纳入 lint、format 和 lint-staged', 'Dependabot 开发依赖分组升级'],
      },
    ],
    contributors: [
      {
        name: '@drewf',
        url: 'https://github.com/drewf',
        description: '外部会话支持与 Agent 工具识别',
      },
      {
        name: '@Commandershadow9',
        url: 'https://github.com/Commandershadow9',
        description: '多根工作区 agent 检测',
      },
      {
        name: '@mitre88',
        url: 'https://github.com/mitre88',
        description: '重复恢复、工具状态重连和工具检测修复',
      },
      {
        name: '@noam971',
        url: 'https://github.com/noam971',
        description: '重复恢复、工具状态重连和工具检测修复',
      },
      {
        name: '@itsManeka',
        url: 'https://github.com/itsManeka',
        description: '从外部素材目录加载自定义角色',
      },
      {
        name: '@pablodelucca',
        url: 'https://github.com/pablodelucca',
        description: 'Claude Code Hooks 集成与 Tailwind v4 迁移',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Claude Code Hooks 集成与 Tailwind v4 迁移',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Hooks 优先的双模式架构与评审协调',
      },
    ],
  },
  {
    version: '1.2',
    sections: [
      {
        title: '新功能',
        items: [
          '绕过权限模式：右键点击 “+ Agent” 可跳过工具审批',
          '外部素材包：从用户定义目录加载家具',
          '改进座位、子 agent 生成和后台 agent 支持',
          '新增始终显示 agent 标签的设置',
          'Agent 连接诊断与 JSONL 解析容错',
          '用于开发和评审的浏览器预览模式',
        ],
      },
      {
        title: '修复',
        items: ['修复 Linux Mint/macOS 在未打开文件夹时 agent 不显示的问题'],
      },
      {
        title: '测试',
        items: ['使用 mock Claude CLI 的 Playwright 端到端测试'],
      },
      {
        title: '维护',
        items: ['升级 Vite 8.0、ESLint 10 以及多项依赖', '改进 Dependabot 与徽章更新的 CI 流程'],
      },
    ],
    contributors: [
      {
        name: '@marctebo',
        url: 'https://github.com/marctebo',
        description: '外部素材包支持',
      },
      {
        name: '@dankadr',
        url: 'https://github.com/dankadr',
        description: '绕过权限模式',
      },
      {
        name: '@d4rkd0s',
        url: 'https://github.com/d4rkd0s',
        description: '修复 Linux/macOS 未打开文件夹时的问题',
      },
      {
        name: '@daniel-dallimore',
        url: 'https://github.com/daniel-dallimore',
        description: '始终显示标签设置',
      },
      {
        name: '@NNTin',
        url: 'https://github.com/NNTin',
        description: 'Playwright 端到端测试与浏览器预览模式',
      },
      {
        name: '@florintimbuc',
        url: 'https://github.com/florintimbuc',
        description: 'Agent 诊断、JSONL 容错与 CI 改进',
      },
    ],
  },
];

export function getChangelogEntries(language: Language): ChangelogEntry[] {
  return language === 'zh' ? zhChangelogEntries : changelogEntries;
}
