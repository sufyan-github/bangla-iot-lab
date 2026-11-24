import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Goes to the element a link's #hash names once the page has drawn it, as the
 * router leaves that to the page. `ready` waits for content that arrives later.
 *
 * It jumps there at once. A smooth scroll down a long page takes seconds on a
 * slow phone, and a link is a request to be there, not to watch the way.
 */
export function useHashScroll(ready = true): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || hash.length < 2) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, ready]);
}
