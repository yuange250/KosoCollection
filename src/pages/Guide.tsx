import { Link } from 'react-router-dom';

export function Guide() {
  return (
    <div className="page">
      <div className="page-inner prose">
        <h1>使用指南</h1>
        <h2>网站层级</h2>
        <p>
          「科索造物集」是作品集合站点；当前首个上线作品是<strong>游戏史时间轴</strong>。本页主要说明该作品的交互方式，后续新增作品会在此页持续补充独立说明。
        </p>
        <h2>作品一：游戏史时间轴</h2>
        <p>以下操作均针对当前首页的“游戏史时间轴”面板，示意图为结构示意，实际操作以页面为准。</p>

        <h2>缩放（十年 → 年 → 月日）</h2>
        <ul>
          <li>
            在<strong>时间轴画布</strong>上<strong>向上滚动滚轮</strong>：视野缩小（时间范围变窄），逐步进入年份、月日层级。
          </li>
          <li>
            <strong>向下滚动滚轮</strong>：视野放大（时间范围变宽），回到更粗的十年概览。
          </li>
          <li>顶部右侧提示当前为「十年 / 年份 / 月日」哪一层级视图。</li>
        </ul>

        <div className="diagram diagram--zoom" aria-hidden>
          <div className="diagram-bar diagram-bar--wide">1950s —— 2020s（十年）</div>
          <span className="diagram-arrow">↓ 滚轮向上</span>
          <div className="diagram-bar diagram-bar--mid">1985 — 1995（年份）</div>
          <span className="diagram-arrow">↓ 滚轮向上</span>
          <div className="diagram-bar diagram-bar--narrow">1996-01 — 1996-12（月日）</div>
        </div>

        <h2>平移</h2>
        <p>按住鼠标左键在轴上<strong>左右拖拽</strong>，可快速定位到其他年代。刷新页面后会尽量<strong>记住上次的可视范围</strong>（浏览器本地存储）。</p>

        <h2>发行热度曲线</h2>
        <p>
          时间轴下方橙色区域为<strong>游戏发行热度</strong>：在当前可见时间范围内，按等分时段统计
          <strong>游戏类</strong>节点数量并连成曲线（样本越多、缩放越近，曲线越细腻）。与主轴同步缩放、平移，便于观察产业活跃度的起伏。
        </p>

        <h2>节点与详情卡片</h2>
        <ul>
          <li>
            <span className="dot-sample dot-sample--game" /> 橙色圆点：游戏 ·
            <span className="dot-sample dot-sample--host" /> 蓝色：主机 ·
            <span className="dot-sample dot-sample--event" /> 绿色：事件
          </li>
          <li>悬停节点可看到标题与时间；点击打开详情卡片。</li>
          <li>卡片内可上下滚动；图片可点击放大；「关联条目」可跳回时间轴对应节点。</li>
        </ul>

        <h2>筛选</h2>
        <p>导航栏第二行提供多选筛选：平台、类型、地区、厂商与内容类型。可多条件组合，例如「日本 + RPG + 游戏」。点「清除筛选」恢复全部条目。</p>

        <h2>搜索</h2>
        <p>在顶部搜索框输入关键词（如「马里奥」「PS5」「1996」），点「搜索」或按回车。若有结果，可点击条目以定位并放大；若无结果会提示更换关键词。</p>

        <p className="page-back">
          <Link to="/">← 返回科索造物集首页</Link>
        </p>
      </div>
    </div>
  );
}
