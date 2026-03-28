import { Link } from 'react-router-dom';

export function About() {
  return (
    <div className="page">
      <div className="page-inner prose">
        <h1>关于我们</h1>
        <p>
          「游戏史时间轴」面向游戏爱好者、收藏者与研究者，用<strong>多级缩放</strong>的方式纵览从 1958
          年至今的重要游戏、主机与产业事件，并包含<strong>中国游戏史</strong>相关节点。
        </p>
        <p>
          数据优先引用可查证来源链接；图片在无版权素材时使用站内占位图，您也可通过后台脚本与图床 API
          批量替换为可商用配图。
        </p>
        <p>本站为公开访问，不提供账号体系；反馈与建议可通过导航中的表单提交。</p>
        <p className="page-back">
          <Link to="/">← 返回首页</Link>
        </p>
      </div>
    </div>
  );
}
