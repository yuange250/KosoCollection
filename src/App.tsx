import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { GameBackdrop } from '@/components/GameBackdrop';
import { Home } from '@/pages/Home';
import { Guide } from '@/pages/Guide';
import { About } from '@/pages/About';
import { Feedback } from '@/pages/Feedback';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-root">
        <GameBackdrop />
        <div className="app-root__content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/about" element={<About />} />
            <Route path="/feedback" element={<Feedback />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
