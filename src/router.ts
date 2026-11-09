import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function readHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  return {
    path: pathPart.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(queryPart),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(path: string[], query?: Record<string, string | undefined>): string {
  const p = path.map(encodeURIComponent).join('/');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) q.set(k, v);
  const qs = q.toString();
  return `#/${p}${qs ? `?${qs}` : ''}`;
}

export function navigate(path: string[], query?: Record<string, string | undefined>, replace = false) {
  const next = href(path, query);
  if (replace) window.history.replaceState(null, '', next);
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = next;
}

export const providerHref = (provider: string) => href(['providers', provider]);
