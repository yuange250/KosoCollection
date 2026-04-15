import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { WORKS, type WorkEntry } from '@/lib/works';
import { BackToTop } from '@/components/BackToTop';

function WorkCard({ work, index }: { work: WorkEntry; index: number }) {
  const inner = (
    <motion.div
      className="work-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: 0.12 + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="work-card__cover">
        <img src={work.cover} alt={work.title} loading="lazy" />
        {!work.ready && <span className="work-card__badge">即将上线</span>}
      </div>
      <div className="work-card__body">
        <span className="work-card__subtitle">{work.subtitle}</span>
        <h3 className="work-card__title">{work.title}</h3>
        <p className="work-card__desc">{work.description}</p>
        <div className="work-card__tags">
          {work.tags.map((t) => (
            <span key={t} className="work-card__tag">
              {t}
            </span>
          ))}
        </div>
      </div>
      <span className="work-card__action">
        {work.ready ? '进入作品 →' : '敬请期待'}
      </span>
    </motion.div>
  );

  if (work.ready) {
    return (
      <Link to={work.path} className="work-card-link">
        {inner}
      </Link>
    );
  }

  return <div className="work-card-link work-card-link--disabled">{inner}</div>;
}

export function Portal() {
  return (
    <div className="layout">
      <motion.header
        className="portal-nav"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="portal-nav__inner">
          <Link to="/" className="nav-logo">
            <span className="nav-logo-mark">
              <span className="nav-logo-mark__inner">KS</span>
            </span>
            <span className="nav-logo-text">科索造物集</span>
          </Link>
          <nav className="nav-links">
            <Link to="/guide" className="nav-links__a">
              使用指南
            </Link>
            <Link to="/about" className="nav-links__a">
              关于我们
            </Link>
            <Link to="/feedback" className="nav-links__a">
              反馈建议
            </Link>
          </nav>
        </div>
      </motion.header>

      <motion.main
        className="portal-main"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <section className="portal-hero">
          <h1 className="portal-hero__title">科索造物集</h1>
          <p className="portal-hero__sub">
            和 AI 一起探索并创造有意思的事
          </p>
        </section>

        <section className="portal-works">
          <h2 className="portal-works__heading">作品集</h2>
          <div className="portal-works__grid">
            {WORKS.map((w, i) => (
              <WorkCard key={w.id} work={w} index={i} />
            ))}
          </div>
        </section>
      </motion.main>

      <footer className="footer">
        <p>科索造物集 · 和 AI 一起探索并创造有意思的事</p>
      </footer>

      <BackToTop />
    </div>
  );
}
