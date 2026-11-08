import { useEffect, useState } from 'react';
import { FONT_LOAD_SPECS } from '../lib/text';

export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await Promise.all(FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)));
        await document.fonts.ready;
      } catch {
        // The fallback stack still works if a local font file fails.
      }
      if (active) setReady(true);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return ready;
}
