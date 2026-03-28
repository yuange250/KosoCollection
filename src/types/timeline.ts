export type NodeType = 'game' | 'host' | 'event';

export interface NodeDetails {
  developer?: string;
  publisher?: string;
  sales?: string;
  easterEgg?: string;
  parameters?: string;
  price?: string;
  lifeCycle?: string;
  exclusiveGames?: string[];
  background?: string;
  impact?: string;
  relatedContent?: string[];
}

export interface NodeContent {
  intro: string;
  details: NodeDetails;
  imageUrl: string;
  sourceUrl: string;
  tags: string[];
}

export interface TimelineNode {
  id: string;
  time: string;
  type: NodeType;
  title: string;
  content: NodeContent;
  relatedNodes: string[];
  /** 可选：1–100，越高越优先进入「里程碑图文卡」 */
  importance?: number;
}

export type ZoomLayer = 'decade' | 'year' | 'day';

export interface TimelineViewport {
  /** Visible domain in decimal years, e.g. 1985.7 */
  domain: [number, number];
  layer: ZoomLayer;
}
