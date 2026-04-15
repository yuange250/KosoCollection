import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTrack() {
  const { pathname } = useLocation();

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE || '';
    const payload = {
      path: pathname,
      referrer: document.referrer || '',
      screenW: window.screen?.width || 0,
      screenH: window.screen?.height || 0,
    };
    fetch(`${base}/api/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [pathname]);
}
