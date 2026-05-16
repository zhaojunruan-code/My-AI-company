/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { vscode } from './vscodeApi.js';

export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'pixel-agents.language';

const en = {
  'common.close': 'Close',
  'common.clear': 'Clear',
  'common.gotIt': 'Got it',
  'common.loading': 'Loading...',
  'common.no': 'No',
  'common.yes': 'Yes',
  'language.english': 'English',
  'language.label': 'Language',
  'language.chinese': '中文',
  'toolbar.startAgent': '+ Claude Agent',
  'toolbar.startAgentTitle': 'Start a new Claude agent',
  'toolbar.startCodex': '+ Codex Agent',
  'toolbar.startCodexTitle': 'Start a new Codex agent',
  'toolbar.skipPermissions': 'Skip permissions mode',
  'toolbar.layout': 'Layout',
  'toolbar.layoutTitle': 'Edit office layout',
  'toolbar.settings': 'Settings',
  'settings.title': 'Settings',
  'settings.openSessionsFolder': 'Open Sessions Folder',
  'settings.exportLayout': 'Export Layout',
  'settings.importLayout': 'Import Layout',
  'settings.addAssetDirectory': 'Add Asset Directory',
  'settings.removeAssetDirectory': 'Remove asset directory',
  'settings.soundNotifications': 'Sound Notifications',
  'settings.watchAllSessions': 'Watch All Sessions',
  'settings.instantDetection': 'Instant Detection (Hooks)',
  'settings.alwaysShowLabels': 'Always Show Labels',
  'settings.debugView': 'Debug View',
  'editor.furniture': 'Furniture',
  'editor.furnitureTitle': 'Place furniture',
  'editor.floor': 'Floor',
  'editor.floorTitle': 'Paint floor tiles',
  'editor.wall': 'Wall',
  'editor.wallTitle': 'Paint walls (click to toggle)',
  'editor.erase': 'Erase',
  'editor.eraseTitle': 'Erase tiles to void',
  'editor.color': 'Color',
  'editor.floorColorTitle': 'Adjust floor color',
  'editor.wallColorTitle': 'Adjust wall color',
  'editor.furnitureColorTitle': 'Adjust selected furniture color',
  'editor.pick': 'Pick',
  'editor.pickFloorTitle': 'Pick floor pattern + color from existing tile',
  'editor.pickFurnitureTitle': 'Pick furniture type from placed item',
  'editor.clearColorTitle': 'Remove color (restore original)',
  'editor.floorPattern': 'Floor {index}',
  'editor.wallSet': 'Wall {index}',
  'editor.colorize': 'Colorize',
  'editor.rotateHint': 'Rotate (R)',
  'editor.undo': 'Undo',
  'editor.undoTitle': 'Undo (Ctrl+Z)',
  'editor.redo': 'Redo',
  'editor.redoTitle': 'Redo (Ctrl+Y)',
  'editor.save': 'Save',
  'editor.saveTitle': 'Save layout',
  'editor.reset': 'Reset',
  'editor.resetTitle': 'Reset to last saved layout',
  'editor.resetConfirm': 'Reset?',
  'category.desks': 'Desks',
  'category.chairs': 'Chairs',
  'category.storage': 'Storage',
  'category.electronics': 'Tech',
  'category.decor': 'Decor',
  'category.wall': 'Wall',
  'category.misc': 'Misc',
  'zoom.inTitle': 'Zoom in (Ctrl+Scroll)',
  'zoom.outTitle': 'Zoom out (Ctrl+Scroll)',
  'hooks.tooltipTitle': 'Instant Detection Active',
  'hooks.tooltipBody': 'Your agents now respond in real-time.',
  'hooks.viewMore': 'View more',
  'hooks.modalTitle': 'Instant Detection is ON',
  'hooks.modalIntro': 'Your Pixel Agents office now reacts in real-time:',
  'hooks.modalPermission': 'Permission prompts appear instantly',
  'hooks.modalTurns': 'Turn completions detected the moment they happen',
  'hooks.modalSound': 'Sound notifications play immediately',
  'hooks.modalBody':
    'This works through Claude Code Hooks, small event listeners that notify Pixel Agents whenever something happens in your Claude sessions.',
  'hooks.modalDisableHint': 'To disable, go to Settings > Instant Detection',
  'changelog.title': "What's New in v{version}",
  'changelog.contributors': 'Contributors',
  'changelog.viewOnGitHub': 'View on GitHub',
  'migration.title': 'We owe you an apology!',
  'migration.body1':
    "We've just migrated to fully open-source assets, all built from scratch with love. Unfortunately, this means your previous layout had to be reset.",
  'migration.body2': "We're really sorry about that.",
  'migration.body3':
    'The good news? This was a one-time thing, and it paves the way for some genuinely exciting updates ahead.',
  'migration.body4': 'Stay tuned, and thanks for using Pixel Agents!',
  'version.updated': 'Updated to v{version}!',
  'version.seeWhatsNew': "See what's new",
  'version.seeWhatsNewBang': "See what's new!",
  'debug.title': 'Debug View',
  'debug.agent': 'Agent #{id}',
  'debug.closeAgentTitle': 'Close agent',
  'debug.needsApproval': 'Needs approval',
  'debug.mightBeWaiting': 'Might be waiting for input',
  'debug.jsonlConnected': 'JSONL connected',
  'debug.jsonlNotFound': 'JSONL not found',
  'debug.lines': 'Lines',
  'debug.lastData': 'Last data',
  'debug.projectDirMissing': 'Project dir does not exist: {path}',
  'debug.fileHasData':
    'File has data ({bytes} bytes) but 0 lines parsed. Possible format issue.',
  'time.never': 'never',
  'time.justNow': 'just now',
  'time.secondsAgo': '{count}s ago',
  'time.minutesAgo': '{count}m ago',
  'time.hoursAgo': '{count}h ago',
  'status.idle': 'Idle',
  'status.needsApproval': 'Needs approval',
  'status.subtask': 'Subtask',
  'status.lead': 'LEAD',
  'status.contextUsed': '{percent}% context used ({tokens}k tokens)',
} as const;

const zh: Record<keyof typeof en, string> = {
  'common.close': '关闭',
  'common.clear': '清除',
  'common.gotIt': '知道了',
  'common.loading': '加载中...',
  'common.no': '否',
  'common.yes': '是',
  'language.english': 'English',
  'language.label': '语言',
  'language.chinese': '中文',
  'toolbar.startAgent': '+ Claude Agent',
  'toolbar.startAgentTitle': '启动一个新的 Claude Agent',
  'toolbar.startCodex': '+ Codex Agent',
  'toolbar.startCodexTitle': '启动一个新的 Codex Agent',
  'toolbar.skipPermissions': '跳过权限确认模式',
  'toolbar.layout': '布局',
  'toolbar.layoutTitle': '编辑办公室布局',
  'toolbar.settings': '设置',
  'settings.title': '设置',
  'settings.openSessionsFolder': '打开会话文件夹',
  'settings.exportLayout': '导出布局',
  'settings.importLayout': '导入布局',
  'settings.addAssetDirectory': '添加素材目录',
  'settings.removeAssetDirectory': '移除素材目录',
  'settings.soundNotifications': '声音通知',
  'settings.watchAllSessions': '监听所有会话',
  'settings.instantDetection': '实时检测（Hooks）',
  'settings.alwaysShowLabels': '始终显示标签',
  'settings.debugView': '调试视图',
  'editor.furniture': '家具',
  'editor.furnitureTitle': '放置家具',
  'editor.floor': '地板',
  'editor.floorTitle': '绘制地板',
  'editor.wall': '墙面',
  'editor.wallTitle': '绘制墙面（点击切换）',
  'editor.erase': '擦除',
  'editor.eraseTitle': '擦除为空白格',
  'editor.color': '颜色',
  'editor.floorColorTitle': '调整地板颜色',
  'editor.wallColorTitle': '调整墙面颜色',
  'editor.furnitureColorTitle': '调整选中家具颜色',
  'editor.pick': '拾取',
  'editor.pickFloorTitle': '从现有地块拾取地板样式和颜色',
  'editor.pickFurnitureTitle': '从已放置家具拾取类型',
  'editor.clearColorTitle': '移除颜色（恢复原始样式）',
  'editor.floorPattern': '地板 {index}',
  'editor.wallSet': '墙面 {index}',
  'editor.colorize': '着色',
  'editor.rotateHint': '旋转 (R)',
  'editor.undo': '撤销',
  'editor.undoTitle': '撤销 (Ctrl+Z)',
  'editor.redo': '重做',
  'editor.redoTitle': '重做 (Ctrl+Y)',
  'editor.save': '保存',
  'editor.saveTitle': '保存布局',
  'editor.reset': '重置',
  'editor.resetTitle': '重置为上次保存的布局',
  'editor.resetConfirm': '重置？',
  'category.desks': '桌子',
  'category.chairs': '椅子',
  'category.storage': '收纳',
  'category.electronics': '电子设备',
  'category.decor': '装饰',
  'category.wall': '墙饰',
  'category.misc': '其他',
  'zoom.inTitle': '放大（Ctrl+滚轮）',
  'zoom.outTitle': '缩小（Ctrl+滚轮）',
  'hooks.tooltipTitle': '实时检测已启用',
  'hooks.tooltipBody': '你的 agent 现在会实时响应。',
  'hooks.viewMore': '查看更多',
  'hooks.modalTitle': '实时检测已开启',
  'hooks.modalIntro': 'Pixel Agents 办公室现在会实时响应：',
  'hooks.modalPermission': '权限请求会即时显示',
  'hooks.modalTurns': '回合结束会在发生时立刻检测到',
  'hooks.modalSound': '声音通知会立即播放',
  'hooks.modalBody':
    '它通过 Claude Code Hooks 工作，这些轻量事件监听器会在 Claude 会话发生变化时通知 Pixel Agents。',
  'hooks.modalDisableHint': '如需关闭，请前往 设置 > 实时检测',
  'changelog.title': 'v{version} 更新内容',
  'changelog.contributors': '贡献者',
  'changelog.viewOnGitHub': '在 GitHub 查看',
  'migration.title': '很抱歉给你添麻烦了！',
  'migration.body1':
    '我们刚刚迁移到了完全开源、从零制作的素材。遗憾的是，这意味着你之前的布局需要被重置。',
  'migration.body2': '真的很抱歉。',
  'migration.body3': '好消息是，这只是一次性的调整，并且会为后续更棒的更新打好基础。',
  'migration.body4': '感谢你使用 Pixel Agents，后面会有更多好东西。',
  'version.updated': '已更新到 v{version}！',
  'version.seeWhatsNew': '查看更新内容',
  'version.seeWhatsNewBang': '查看更新内容！',
  'debug.title': '调试视图',
  'debug.agent': 'Agent #{id}',
  'debug.closeAgentTitle': '关闭 agent',
  'debug.needsApproval': '需要批准',
  'debug.mightBeWaiting': '可能正在等待输入',
  'debug.jsonlConnected': 'JSONL 已连接',
  'debug.jsonlNotFound': '未找到 JSONL',
  'debug.lines': '行数',
  'debug.lastData': '最近数据',
  'debug.projectDirMissing': '项目目录不存在：{path}',
  'debug.fileHasData': '文件有数据（{bytes} 字节），但解析行数为 0。可能是格式问题。',
  'time.never': '从未',
  'time.justNow': '刚刚',
  'time.secondsAgo': '{count} 秒前',
  'time.minutesAgo': '{count} 分钟前',
  'time.hoursAgo': '{count} 小时前',
  'status.idle': '空闲',
  'status.needsApproval': '需要批准',
  'status.subtask': '子任务',
  'status.lead': '负责人',
  'status.contextUsed': '已使用 {percent}% 上下文（{tokens}k tokens）',
};

const dictionaries = { en, zh } as const;

export type TranslationKey = keyof typeof en;
type TranslationValues = Record<string, string | number>;

const zhFurnitureLabels: Record<string, string> = {
  Bin: '垃圾桶',
  Bookshelf: '书架',
  Cactus: '仙人掌',
  Clock: '时钟',
  Coffee: '咖啡',
  'Coffee Table': '咖啡桌',
  'Cushioned Bench': '软垫长椅',
  'Cushioned Chair': '软垫椅',
  Desk: '办公桌',
  'Double Bookshelf': '双层书架',
  'Hanging Plant': '悬挂植物',
  'Large Painting': '大幅画作',
  'Large Plant': '大型植物',
  PC: '电脑',
  Plant: '植物',
  Pot: '盆栽',
  'Small Painting': '小幅画作',
  'Small Table': '小桌',
  Sofa: '沙发',
  Table: '桌子',
  Whiteboard: '白板',
  'Wooden Bench': '木质长椅',
  'Wooden Chair': '木椅',
};

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  formatToolStatus: (status: string) => string;
  translateFurnitureLabel: (label: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function normalizeLanguage(value: unknown): Language | null {
  return value === 'zh' || value === 'en' ? value : null;
}

function readStoredLanguage(): Language | null {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function detectLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function writeStoredLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Ignore storage errors in constrained webviews.
  }
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
}

export function translate(language: Language, key: TranslationKey, values?: TranslationValues) {
  return interpolate(dictionaries[language][key] ?? dictionaries.en[key], values);
}

export function translateFurnitureLabel(label: string, language: Language): string {
  if (language === 'en') return label;
  return zhFurnitureLabels[label] ?? label;
}

export function formatLocalizedToolStatus(status: string, language: Language): string {
  if (language === 'en') return status;

  const after = (prefix: string) => status.slice(prefix.length).trim();
  if (status.startsWith('Reading ')) return `正在读取 ${after('Reading ')}`;
  if (status.startsWith('Editing ')) return `正在编辑 ${after('Editing ')}`;
  if (status.startsWith('Writing ')) return `正在写入 ${after('Writing ')}`;
  if (status.startsWith('Running: ')) return `正在运行：${after('Running: ')}`;
  if (status === 'Searching files') return '正在搜索文件';
  if (status === 'Searching code') return '正在搜索代码';
  if (status === 'Searching the web') return '正在搜索网页';
  if (status === 'Fetching web content') return '正在获取网页内容';
  if (status.startsWith('Subtask: ')) return `子任务：${after('Subtask: ')}`;
  if (status === 'Running subtask') return '正在执行子任务';
  if (status === 'Waiting for your answer') return '等待你的回答';
  if (status === 'Planning') return '正在规划';
  if (status === 'Editing notebook') return '正在编辑笔记本';
  if (status.startsWith('Creating team: ')) return `正在创建团队：${after('Creating team: ')}`;
  if (status === 'Creating team') return '正在创建团队';
  if (status.startsWith('-> ')) return `发送给 ${after('-> ')}`;
  if (status === 'Sending message') return '正在发送消息';
  if (status.startsWith('Using ')) return `正在使用 ${after('Using ')}`;

  return status;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  const applyLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeStoredLanguage(next);
  }, []);

  const setLanguage = useCallback(
    (next: Language) => {
      applyLanguage(next);
      vscode.postMessage({ type: 'setLanguage', language: next });
    },
    [applyLanguage],
  );

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type !== 'settingsLoaded') return;
      const incoming = normalizeLanguage(message.language);
      if (incoming) {
        applyLanguage(incoming);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [applyLanguage]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, values) => translate(language, key, values),
      formatToolStatus: (status) => formatLocalizedToolStatus(status, language),
      translateFurnitureLabel: (label) => translateFurnitureLabel(label, language),
    }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
