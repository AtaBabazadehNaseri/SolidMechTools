import katex from 'katex';
import { useMemo } from 'react';

export function Tex({ children, display = false }: { children: string; display?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { throwOnError: false, displayMode: display }),
    [children, display],
  );
  return <span className={display ? 'tex-display' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}
