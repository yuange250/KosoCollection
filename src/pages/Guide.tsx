import { Link } from 'react-router-dom';

export function Guide() {
  return (
    <div className="page">
      <div className="page-inner prose">
        <h1>使用指南</h1>
        <h2>网站结构</h2>
        <p>
          科索造物集是一个作品集合站点。目前已经上线两个作品：<strong>游戏史时间轴</strong> 和 <strong>蓝星之美</strong>。
          它们分别对应时间叙事与空间叙事两种不同的浏览方式。
        </p>

        <h2>作品一：游戏史时间轴</h2>
        <p>以下操作主要针对《游戏史时间轴》页面：</p>

        <h2>缩放</h2>
        <ul>
          <li>在时间轴画布中向上滚动滚轮：缩小时间范围，进入更细的年份或月日视图。</li>
          <li>向下滚动滚轮：放大时间范围，回到更宏观的年代视图。</li>
          <li>顶部提示会显示当前所处的时间层级。</li>
        </ul>

        <div className="diagram diagram--zoom" aria-hidden>
          <div className="diagram-bar diagram-bar--wide">1950s → 2020s（年代）</div>
          <span className="diagram-arrow">→ 滚轮向上</span>
          <div className="diagram-bar diagram-bar--mid">1985 → 1995（年份）</div>
          <span className="diagram-arrow">→ 滚轮向上</span>
          <div className="diagram-bar diagram-bar--narrow">1996-01 → 1996-12（月日）</div>
        </div>

        <h2>平移</h2>
        <p>按住鼠标左键左右拖拽，可快速移动到其他年代。页面会尽量记住你上一次浏览的可视范围。</p>

        <h2>节点与详情</h2>
        <ul>
          <li>
            <span className="dot-sample dot-sample--game" /> 橙色圆点表示游戏，
            <span className="dot-sample dot-sample--host" /> 蓝色表示主机，
            <span className="dot-sample dot-sample--event" /> 绿色表示事件。
          </li>
          <li>悬停可查看标题与时间，点击可打开详情卡片。</li>
          <li>详情卡片支持查看介绍、图片和关联条目。</li>
        </ul>

        <h2>搜索与筛选</h2>
        <p>顶部支持关键词搜索，也可以按平台、类型、地区、厂商等维度组合筛选。</p>

        <h2>作品二：蓝星之美</h2>
        <p>
          《蓝星之美》是一个基于 3D 地球的全球景点浏览作品，更适合从空间分布的角度进入内容。
        </p>
        <ul>
          <li>你可以拖拽、旋转、缩放地球，查看不同地区的景点分布。</li>
          <li>可以按国家、地区、分类、季节等条件筛选感兴趣的目的地。</li>
          <li>点击景点后，可查看图库、简介、亮点、适合季节和基础预算信息。</li>
          <li>如果想随意逛逛，可以先从地球视角开始；如果有明确目标，也可以直接用搜索定位景点。</li>
        </ul>

        <p className="page-back">
          <Link to="/">← 返回科索造物集首页</Link>
        </p>
      </div>
    </div>
  );
}
