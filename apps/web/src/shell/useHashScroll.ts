import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Scrolls to the element a link's #hash names once the page has drawn it, as
 * the router leaves that to the page. `ready` waits for content that arrives later.
 */
export function useHashScroll(ready = true): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }, [hash, ready]);
}
