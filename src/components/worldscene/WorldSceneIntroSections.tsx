import { PROJECT2_FEATURES, PROJECT2_METRICS, PROJECT2_PHASE2_NOTES } from '@/lib/worldsceneData';

interface Props {
  visibleCount: number;
  totalCount: number;
}

export function WorldSceneIntroSections({ visibleCount, totalCount }: Props) {
  return (
    <>
      <section className="worldscene-headline">
        <div>
          <p className="worldscene-eyebrow">蓝星之美</p>
          <h1 className="worldscene-headline__title">在地球上直接浏览、搜索并聚焦景点</h1>
        </div>
        <div className="worldscene-headline__meta">
          <span className="worldscene-meta-pill">全库 {totalCount} 个景点</span>
          <span className="worldscene-meta-pill">当前显示 {visibleCount} 个</span>
        </div>
      </section>

      <section className="worldscene-hero">
        <div className="worldscene-hero__content">
          <p className="worldscene-eyebrow">作品二 · 蓝星之美</p>
          <h1 className="worldscene-hero__title">搜索景点、聚焦地球、规划路线，并快速估算旅途预算</h1>
          <p className="worldscene-hero__desc">
            当前版本已经覆盖核心交互闭环：拖拽地球浏览、全球景点标记、语义搜索、路线预览和轻量预算估算。
          </p>

          <div className="worldscene-metrics">
            {PROJECT2_METRICS.map((metric) => (
              <div key={metric.label} className="worldscene-metric">
                <span className="worldscene-metric__value">{metric.value}</span>
                <span className="worldscene-metric__label">{metric.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="worldscene-hero__visual" aria-hidden="true">
          <div className="worldscene-orbit worldscene-orbit--outer" />
          <div className="worldscene-orbit worldscene-orbit--inner" />
          <div className="worldscene-core">
            <span className="worldscene-core__ring worldscene-core__ring--a" />
            <span className="worldscene-core__ring worldscene-core__ring--b" />
            <span className="worldscene-core__dot" />
          </div>
        </div>
      </section>

      <section className="worldscene-section">
        <div className="worldscene-section__head">
          <p className="worldscene-section__eyebrow">核心模块</p>
          <h2 className="worldscene-section__title">把 3D 浏览、搜索、路线规划和预算工具放进同一个工作台</h2>
        </div>
        <div className="worldscene-feature-grid">
          {PROJECT2_FEATURES.map((feature) => (
            <article key={feature.title} className="worldscene-feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="worldscene-section">
        <div className="worldscene-section__head">
          <p className="worldscene-section__eyebrow">下一步</p>
          <h2 className="worldscene-section__title">这一版已经适合轻量部署，后面还可以继续接入更丰富的实时数据能力</h2>
        </div>
        <div className="worldscene-roadmap">
          {PROJECT2_PHASE2_NOTES.map((note) => (
            <article key={note} className="worldscene-roadmap__item">
              <span className="worldscene-roadmap__index">Next</span>
              <p>{note}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
