export interface WorkEntry {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  /** 首页卡片封面（站内路径或占位图） */
  cover: string;
  /** 路由路径 */
  path: string;
  tags: string[];
  /** 是否已上线可访问 */
  ready: boolean;
}

export const WORKS: readonly WorkEntry[] = [
  {
    id: 'timeline',
    title: '游戏史时间轴',
    subtitle: '作品一',
    description:
      '从 1958 年至今的重要游戏、主机与产业事件，支持多级缩放、筛选搜索与详情卡片。',
    cover: '/placeholders/timeline_banner.png',
    path: '/works/timeline',
    tags: ['互动可视化', '游戏史', 'D3.js'],
    ready: true,
  },
  {
    id: 'worldscene',
    title: '蓝星之美',
    subtitle: '作品二',
    description:
      '在 3D 地球上搜索全球名胜、查看详情、规划基础路线并估算旅途预算的交互式可视化作品。',
    cover: '/placeholders/work-global-atlas.svg',
    path: '/works/worldscene',
    tags: ['蓝星', '3D 地球', '路线规划'],
    ready: true,
  },
];
