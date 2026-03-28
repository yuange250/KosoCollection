/**
 * 全局游戏风背景：动态光晕 + 透视网格 + 微弱扫描线（纯 CSS）
 */
export function GameBackdrop() {
  return (
    <div className="game-backdrop" aria-hidden>
      <div className="game-backdrop__glow game-backdrop__glow--a" />
      <div className="game-backdrop__glow game-backdrop__glow--b" />
      <div className="game-backdrop__glow game-backdrop__glow--c" />
      <div className="game-backdrop__grid" />
      <div className="game-backdrop__scan" />
    </div>
  );
}
