/** 与 Timeline 绘图一致，供高度对齐（里程碑栏、布局等） */

export const TIMELINE_MARGIN = { top: 48, right: 12, bottom: 64, left: 12 } as const;

export const NODE_BAND_TOP = 56;
export const NODE_BAND_H = 214;
export const HEAT_GAP = 14;
export const HEAT_H = 132;

/** SVG 固定高度（与 d3 画布一致） */
export const TIMELINE_SVG_HEIGHT =
  TIMELINE_MARGIN.top +
  NODE_BAND_TOP +
  NODE_BAND_H +
  HEAT_GAP +
  HEAT_H +
  TIMELINE_MARGIN.bottom;
