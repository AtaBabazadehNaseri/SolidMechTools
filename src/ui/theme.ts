import { useEffect, useState } from 'react';

// Light or dark theme: the system setting by default, or the viewer's choice.
// The resolved theme is the data-theme attribute on <html>; index.html sets it
// before the first paint with the same rule, so a dark-mode visit never
// flashes light.

export type ThemePreference = 'system' | 'light' | 'dark';

/** Must match the key read by the inline script in index.html. */
const KEY = 'etl.theme';
const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function stored(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(stored);

  useEffect(() => {
    const mq = darkQuery();
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && !!mq?.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    // Follow the system while the preference is 'system'.
    if (pref !== 'system' || !mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  const choose = (p: ThemePreference) => {
    setPref(p);
    // A per-viewer convenience only; the app works without storage.
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage unavailable */
    }
  };
  return [pref, choose];
}
