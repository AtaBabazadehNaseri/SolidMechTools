import { Tex } from './Tex';

/** Inline markup for guide text: `$…$` renders as TeX, `**…**` as bold. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/g).filter(Boolean);
  const display = parts.length === 1 && /^\$\\dfrac|^\$\\displaystyle/.test(parts[0]);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('$') ? (
          <Tex key={i} display={display}>
            {p.slice(1, -1)}
          </Tex>
        ) : p.startsWith('**') ? (
          <b key={i}>{p.slice(2, -2)}</b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
