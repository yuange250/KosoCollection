import { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GameBackdrop } from '@/components/GameBackdrop';
import { Portal } from '@/pages/Portal';
import { Home } from '@/pages/Home';
import { Guide } from '@/pages/Guide';
import { About } from '@/pages/About';
import { Feedback } from '@/pages/Feedback';
import { PageTracker } from '@/components/PageTracker';
import { WorldScene } from '@/pages/WorldScene';

export default function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <div className="app-root">
        <GameBackdrop />
        <div className="app-root__content">
          <Suspense fallback={<div className="banner banner--loading">正在加载作品内容…</div>}>
            <Routes>
              <Route path="/" element={<Portal />} />
              <Route path="/works/timeline" element={<Home />} />
              <Route path="/works/worldscene" element={<WorldScene />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/about" element={<About />} />
              <Route path="/feedback" element={<Feedback />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}
