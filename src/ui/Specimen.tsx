import { useRef } from 'react';
import { type Control, type Mat, type PlaneMode, type Principal2D, tractionOnCut } from '../mechanics';
import type { Overlays } from '../app/lab';
import { fmt } from '../app/format';

// Display geometry (SVG units). Physical y points up; screen y points down.
const H = 125; // half side of the reference square
const RING = 272;
const VIEW = 300;
/** Arrow length (SVG units) for a traction equal to the reference stress. */
const ARROW_PER_REF = 55;
/** Shortest drawn arrow, so a stem is always visible. */
const MIN_ARROW = 18;
/** Full arrow-head length; shorter arrows get proportionally smaller heads. */
const HEAD = 11;

interface Props {
  strain: number[];
  stress: number[];
  control: readonly Control[];
  mode: PlaneMode;
  /** [σzz, τyz, τxz] reactions in plane strain. */
  outStress: number[];
  pinnedStrain: number[] | null;
  magnification: number;
  R: Mat;
  overlays: Overlays;
  principal: { stress: Principal2D; strain: Principal2D };
  thetaDeg: number;
  onTheta: (deg: number) => void;
  cutDeg: number;
  onCut: (deg: number) => void;
  stressRef: number;
}

type Pt = [number, number];

/**
 * Affine small-strain map x = X + k ε X with the symmetric strain tensor
 * ε = [[εxx, γxy/2], [γxy/2, εyy]]: pure deformation, no rigid rotation.
 * Everything attached to the material (outline, grid, material lines and axes,
 * the cut) is drawn through this map.
 */
function mapper(strain: number[], k: number) {
  const [exx, eyy, gxy] = strain;
  return ([X, Y]: Pt): Pt => [X + k * (exx * X + 0.5 * gxy * Y), Y + k * (0.5 * gxy * X + eyy * Y)];
}

function maxPrincipal(strain: number[]): number {
  const [exx, eyy, gxy] = strain;
  return Math.abs(0.5 * (exx + eyy)) + Math.hypot(0.5 * (exx - eyy), 0.5 * gxy);
}

const scr = ([x, y]: Pt): Pt => [x, -y];
const pts = (ps: Pt[]) => ps.map((p) => scr(p).join(',')).join(' ');
const CORNERS: Pt[] = [[-H, -H], [H, -H], [H, H], [-H, H]];
const unit = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

type ArrowKind = 'applied' | 'reaction' | 'stress' | 'strain' | 'axis' | 'muted';
interface ArrowSpec {
  /** Screen coordinates. */
  from: Pt;
  to: Pt;
  kind: ArrowKind;
  /** One-sided head: the conventional symbol for a shear (tangential) traction. */
  half?: boolean;
  dashed?: boolean;
  width?: number;
}

/** Stem plus head. The head shrinks on short arrows so the stem never disappears. */
function Arrow({ from, to, kind, half, dashed, width = 2.4 }: ArrowSpec) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const u: Pt = [dx / L, dy / L];
  const p: Pt = [-u[1], u[0]];
  const h = Math.min(HEAD, 0.42 * L);
  const w = half ? 0.62 * h : 0.45 * h;
  const base: Pt = [to[0] - h * u[0], to[1] - h * u[1]];
  const head = half
    ? [to, [base[0] + w * p[0], base[1] + w * p[1]], base]
    : [to, [base[0] + w * p[0], base[1] + w * p[1]], [base[0] - w * p[0], base[1] - w * p[1]]];
  const stemEnd = half ? to : base;
  // A dash pattern on a very short stem reads as dots, so short stems stay solid.
  const dash = dashed && Math.hypot(stemEnd[0] - from[0], stemEnd[1] - from[1]) > 18;
  return (
    <g className={`arrow arrow-${kind}`}>
      <line x1={from[0]} y1={from[1]} x2={stemEnd[0]} y2={stemEnd[1]} strokeWidth={width} className={dash ? 'dashed' : ''} />
      <polygon points={head.map((q) => q.join(',')).join(' ')} />
    </g>
  );
}

export function Specimen(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<'theta' | 'cut'>('theta');
  const cap = 0.45 / Math.max(maxPrincipal(p.strain), p.pinnedStrain ? maxPrincipal(p.pinnedStrain) : 0, 1e-300);
  const k = Math.min(p.magnification, cap);
  const capped = p.magnification > cap * (1 + 1e-9);
  const map = mapper(p.strain, k);
  const deformed = CORNERS.map(map);
  const ov = p.overlays;
  const seg = (a: Pt, b: Pt) => {
    const [x1, y1] = scr(map(a));
    const [x2, y2] = scr(map(b));
    return { x1, y1, x2, y2 };
  };

  const gridLines: Array<[Pt, Pt]> = [];
  for (let i = 1; i < 6; i++) {
    const c = -H + (2 * H * i) / 6;
    gridLines.push([[c, -H], [c, H]]);
    gridLines.push([[-H, c], [H, c]]);
  }

  // Material lines parallel to the projected axis 1.
  const axis1: Pt = [p.R[0][0], p.R[1][0]];
  const a1len = Math.hypot(...axis1);
  const texture: Array<[Pt, Pt]> = [];
  if (ov.materialLines && a1len > 0.3) {
    const d: Pt = [axis1[0] / a1len, axis1[1] / a1len];
    const n: Pt = [-d[1], d[0]];
    for (let o = -2 * H; o <= 2 * H; o += 11) {
      texture.push([[o * n[0] - 2 * H * d[0], o * n[1] - 2 * H * d[1]], [o * n[0] + 2 * H * d[0], o * n[1] + 2 * H * d[1]]]);
    }
  }

  const arrows = tractionArrows(p.stress, p.control, map, p.stressRef);

  // Cut through the centre: a material plane, so it is drawn through the map.
  // Its normal n and the traction t = σ·n are tensor directions and are drawn as they are.
  const n = unit(p.cutDeg);
  const tAx: Pt = [-n[1], n[0]];
  const cutT = tractionOnCut(p.stress, (p.cutDeg * Math.PI) / 180);
  if (ov.cut) {
    const P = map([0.5 * H * tAx[0], 0.5 * H * tAx[1]]);
    const len = (v: number) => Math.max(Math.min((Math.abs(v) / p.stressRef) * ARROW_PER_REF, 110), MIN_ARROW);
    if (Math.abs(cutT.normal) > 1e-6 * p.stressRef) {
      const L = len(cutT.normal) * Math.sign(cutT.normal);
      arrows.push({ from: scr(P), to: scr([P[0] + L * n[0], P[1] + L * n[1]]), kind: 'stress' });
    }
    if (Math.abs(cutT.shear) > 1e-6 * p.stressRef) {
      const L = len(cutT.shear) * Math.sign(cutT.shear);
      arrows.push({ from: scr(P), to: scr([P[0] + L * tAx[0], P[1] + L * tAx[1]]), kind: 'stress', half: true });
    }
  }

  const angleAt = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return (Math.atan2(-q.y, q.x) * 180) / Math.PI;
  };
  const snapDeg = (deg: number, shift: boolean) => {
    let d = shift ? Math.round(deg / 15) * 15 : Math.round(deg);
    if (d <= -180) d += 360;
    if (d > 180) d -= 360;
    return d;
  };
  const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const onDown = (e: React.PointerEvent, which?: 'theta' | 'cut') => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const a = angleAt(e);
    dragging.current = which ?? (ov.cut && angDist(a, p.cutDeg) < angDist(a, p.thetaDeg) ? 'cut' : 'theta');
    onMove(e, true);
  };
  const onMove = (e: React.PointerEvent, force = false) => {
    if (!force && !(e.buttons & 1)) return;
    const d = snapDeg(angleAt(e), e.shiftKey);
    if (dragging.current === 'cut') p.onCut(d);
    else p.onTheta(d);
  };

  const handle = (deg: number) => scr([RING * Math.cos((deg * Math.PI) / 180), RING * Math.sin((deg * Math.PI) / 180)]);
  const hT = handle(p.thetaDeg);
  const hC = handle(p.cutDeg);

  return (
    <svg ref={svgRef} className="specimen" viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`} role="img" aria-label="Specimen, reference and deformed configurations">
      <defs>
        <clipPath id="deformed-clip">
          <polygon points={pts(deformed)} />
        </clipPath>
      </defs>

      {/* Orientation ring: drag the handles to rotate the material (teal) or the cut (magenta). */}
      <circle r={RING} className="ring" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        const r0 = i % 6 === 0 ? RING - 10 : RING - 5;
        return <line key={i} x1={r0 * Math.cos(a)} y1={-r0 * Math.sin(a)} x2={RING * Math.cos(a)} y2={-RING * Math.sin(a)} className="ring-tick" />;
      })}
      <circle r={RING} className="ring-hit" onPointerDown={(e) => onDown(e)} onPointerMove={onMove} />

      <polygon points={pts(deformed)} className="deformed" />
      <g clipPath="url(#deformed-clip)">
        {gridLines.map(([a, b], i) => (
          <line key={`g${i}`} {...seg(a, b)} className="grid" />
        ))}
        {texture.map(([a, b], i) => (
          <line key={`t${i}`} {...seg(a, b)} className="texture" />
        ))}
        {ov.cut && <line {...seg([-2 * H * tAx[0], -2 * H * tAx[1]], [2 * H * tAx[0], 2 * H * tAx[1]])} className="cut-line" />}
      </g>
      <polygon points={pts(deformed)} className="deformed-outline" />
      {/* Drawn over the deformed shape so it stays visible when the specimen grows past it (e.g. ν < 0). */}
      <polygon points={pts(CORNERS)} className="reference" />
      {p.pinnedStrain && <polygon points={pts(CORNERS.map(mapper(p.pinnedStrain, k)))} className="ghost" />}

      {ov.materialAxes && <MaterialAxes R={p.R} map={map} />}
      {ov.principalStress && <PrincipalCross pr={p.principal.stress} kind="stress" label="σ" />}
      {ov.principalStrain && <PrincipalCross pr={p.principal.strain} kind="strain" label="ε" />}

      {arrows.map((a, i) => (
        <Arrow key={i} {...a} />
      ))}

      <HeldLabels control={p.control} map={map} />

      <g className="handle handle-theta" onPointerDown={(e) => onDown(e, 'theta')} onPointerMove={onMove}>
        <circle cx={hT[0]} cy={hT[1]} r={10} />
      </g>
      <text x={hT[0]} y={hT[1] + (hT[1] > 0 ? 26 : -16)} className="handle-label" textAnchor="middle">
        θ = {p.thetaDeg}°
      </text>
      {ov.cut && (
        <>
          <g className="handle handle-cut" onPointerDown={(e) => onDown(e, 'cut')} onPointerMove={onMove}>
            <rect x={hC[0] - 8} y={hC[1] - 8} width={16} height={16} rx={3} />
          </g>
          {/* Inside the ring, so it never collides with the θ label outside. */}
          <text x={(RING - 38) * n[0]} y={-(RING - 38) * n[1] + 4} className="handle-label handle-label-cut" textAnchor="middle">
            n {p.cutDeg}°
          </text>
        </>
      )}

      <g transform={`translate(${-VIEW + 8}, ${VIEW - 40})`} className="scale-bar">
        <line x1={0} y1={0} x2={ARROW_PER_REF} y2={0} />
        <line x1={0} y1={-4} x2={0} y2={4} />
        <line x1={ARROW_PER_REF} y1={-4} x2={ARROW_PER_REF} y2={4} />
        <text x={ARROW_PER_REF + 8} y={4}>{fmt(p.stressRef, 3)} MPa</text>
      </g>
      <text x={-VIEW + 8} y={VIEW - 12} className={capped ? 'mag mag-warn' : 'mag'}>
        {capped
          ? `Displacements ×${fmt(k, 3)} (requested ×${fmt(p.magnification, 3)}, capped so the drawing does not invert)`
          : `Displacements ×${fmt(k, 3)}: display only`}
      </text>

      {p.mode === 'strain' && (
        <g className="oop-badge" transform={`translate(${VIEW - 12}, ${-VIEW + 18})`}>
          <text textAnchor="end">plane strain: εzz = 0 is held by</text>
          <text textAnchor="end" y={16}>
            σzz = {fmt(p.outStress[0], 3)} MPa (reaction, out of page)
          </text>
        </g>
      )}

      <g transform={`translate(${VIEW - 52}, ${VIEW - 22})`} className="triad">
        <Arrow from={[0, 0]} to={[34, 0]} kind="muted" width={1.6} />
        <Arrow from={[0, 0]} to={[0, -34]} kind="muted" width={1.6} />
        <text x={38} y={4}>x</text>
        <text x={-4} y={-40}>y</text>
      </g>
    </svg>
  );
}

/** Arrow legend, kept outside the drawing so it never collides with the ring handles. */
export function SpecimenLegend({ cut }: { cut: boolean }) {
  const item = (kind: ArrowKind, text: string, opts: { half?: boolean; dashed?: boolean } = {}) => (
    <span className="legend-item">
      <svg viewBox="0 -6 36 12" width={36} height={12} aria-hidden>
        <Arrow from={[1, 0]} to={[35, 0]} kind={kind} width={2.2} {...opts} />
      </svg>
      {text}
    </span>
  );
  return (
    <div className="specimen-legend">
      {item('applied', 'prescribed traction')}
      {item('reaction', 'reaction traction', { dashed: true })}
      {item('muted', 'one-sided head = shear (tangential) traction', { half: true })}
      {cut && item('stress', 'traction on the cut, t = σ·n')}
    </div>
  );
}

/** Material axes, carried by the displayed deformation like the material lines. */
function MaterialAxes({ R, map }: { R: Mat; map: (p: Pt) => Pt }) {
  const L = 70;
  return (
    <g className="material-axes">
      {[0, 1, 2].map((k) => {
        const v: Pt = [R[0][k], R[1][k]];
        const vz = R[2][k];
        if (Math.hypot(...v) < 0.08) {
          return (
            <g key={k}>
              <circle r={7} className="axis-out" />
              {vz > 0 ? <circle r={2} className="axis-dot" /> : <path d="M-5,-5 L5,5 M-5,5 L5,-5" className="axis-cross" />}
              <text x={9} y={-9} className="axis-label">{k + 1}</text>
            </g>
          );
        }
        const lab = scr(map([(L + 13) * v[0], (L + 13) * v[1]]));
        return (
          <g key={k}>
            <Arrow from={[0, 0]} to={scr(map([L * v[0], L * v[1]]))} kind="axis" width={1.8} />
            <text x={lab[0]} y={lab[1] + 4} textAnchor="middle" className="axis-label">{k + 1}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Principal directions drawn as a cross; heads point outward for tension/extension, inward for compression. */
function PrincipalCross({ pr, kind, label }: { pr: Principal2D; kind: 'stress' | 'strain'; label: string }) {
  const big = Math.max(Math.abs(pr.max), Math.abs(pr.min));
  if (!(big > 0)) return null;
  const segs: Array<{ v: number; ang: number; name: string }> = [
    { v: pr.max, ang: pr.angle, name: `${label}₁` },
    { v: pr.min, ang: pr.angle + Math.PI / 2, name: `${label}₂` },
  ];
  return (
    <g className={`principal principal-${kind}`}>
      {segs.map(({ v, ang, name }) => {
        if (Math.abs(v) < 1e-9 * big) return null;
        const L = 24 + 81 * (Math.abs(v) / big);
        const d: Pt = [Math.cos(ang), Math.sin(ang)];
        return [1, -1].map((s) => {
          const tip = scr([s * L * d[0], s * L * d[1]]);
          const base = scr([s * 6 * d[0], s * 6 * d[1]]);
          return (
            <g key={`${name}${s}`}>
              <Arrow from={v > 0 ? base : tip} to={v > 0 ? tip : base} kind={kind} dashed={kind === 'strain'} width={2.6} />
              {s === 1 && (
                <text x={tip[0] + 6 * d[0]} y={tip[1] - 6 * d[1] - 4} className="principal-label">
                  {name}
                </text>
              )}
            </g>
          );
        });
      })}
    </g>
  );
}

/** Traction arrows on the deformed faces, split into prescribed and reaction parts. */
function tractionArrows(stress: number[], control: readonly Control[], map: (p: Pt) => Pt, ref: number): ArrowSpec[] {
  const out: ArrowSpec[] = [];
  const kind = (i: number): ArrowKind => (control[i] === 'stress' ? 'applied' : 'reaction');
  const len = (s: number) => Math.max(Math.min((Math.abs(s) / ref) * ARROW_PER_REF, 120), MIN_ARROW);
  const tiny = 1e-6 * ref;
  const hasShear = Math.abs(stress[2]) >= tiny;
  // Shear arrows hug the face; normal arrows start just beyond them, so the two never cross.
  const shearOff = 8;
  const gap = hasShear ? 16 : 5;
  const stations = [-0.8, -0.4, 0, 0.4, 0.8];

  // Normal tractions: σxx on x faces, σyy on y faces. Outward for tension.
  const normal = (s: number, comp: 0 | 1) => {
    if (Math.abs(s) < tiny) return;
    const L = len(s);
    for (const side of [1, -1]) {
      const nrm: Pt = comp === 0 ? [side, 0] : [0, side];
      for (const t of stations) {
        const f = map(comp === 0 ? [side * H, t * H] : [t * H, side * H]);
        const near: Pt = [f[0] + gap * nrm[0], f[1] + gap * nrm[1]];
        const far: Pt = [f[0] + (gap + L) * nrm[0], f[1] + (gap + L) * nrm[1]];
        const dashed = control[comp] === 'strain';
        out.push(s > 0 ? { from: scr(near), to: scr(far), kind: kind(comp), dashed } : { from: scr(far), to: scr(near), kind: kind(comp), dashed });
      }
    }
  };
  normal(stress[0], 0);
  normal(stress[1], 1);

  // Shear traction τxy: +y on the +x face, +x on the +y face, opposite on the others.
  if (hasShear) {
    const tau = stress[2];
    const L = Math.max(Math.min((Math.abs(tau) / ref) * ARROW_PER_REF, 1.8 * H), MIN_ARROW + 14);
    const sgn = Math.sign(tau);
    const faces: Array<{ X: Pt; n: Pt; dir: Pt }> = [
      { X: [H, 0], n: [1, 0], dir: [0, sgn] },
      { X: [-H, 0], n: [-1, 0], dir: [0, -sgn] },
      { X: [0, H], n: [0, 1], dir: [sgn, 0] },
      { X: [0, -H], n: [0, -1], dir: [-sgn, 0] },
    ];
    for (const { X, n, dir } of faces) {
      const m = map(X);
      const c: Pt = [m[0] + shearOff * n[0], m[1] + shearOff * n[1]];
      out.push({
        from: scr([c[0] - (L / 2) * dir[0], c[1] - (L / 2) * dir[1]]),
        to: scr([c[0] + (L / 2) * dir[0], c[1] + (L / 2) * dir[1]]),
        kind: kind(2),
        half: true,
        dashed: control[2] === 'strain',
      });
    }
  }
  return out;
}

function HeldLabels({ control, map }: { control: readonly Control[]; map: (p: Pt) => Pt }) {
  const spots: Array<{ corner: Pt; dx: number; dy: number; anchor: 'start' | 'end'; text: string }> = [
    { corner: [H, -H], dx: 10, dy: 22, anchor: 'start', text: 'εxx prescribed' },
    { corner: [-H, H], dx: -10, dy: -12, anchor: 'end', text: 'εyy prescribed' },
    { corner: [H, H], dx: 10, dy: -12, anchor: 'start', text: 'γxy prescribed' },
  ];
  return (
    <g className="held">
      {spots.map((s, i) => {
        if (control[i] !== 'strain') return null;
        const [x, y] = scr(map(s.corner));
        return (
          <text key={i} x={x + s.dx} y={y + s.dy} textAnchor={s.anchor}>
            {s.text}
          </text>
        );
      })}
    </g>
  );
}
