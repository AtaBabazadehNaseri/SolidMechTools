import { directionalModuli } from '../mechanics';
import type { LabDerived, LabState } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, withParam } from './helpers';

const fibres = { overlays: { materialAxes: true, materialLines: true } };

/** An orthotropic material that starts with isotropic constants (E = 200 GPa, ν = 0.3) in every direction. */
const G_ISO = 200_000 / 2.6;
export const ISO_ORTHO = { E1: 200_000, E2: 200_000, E3: 200_000, nu12: 0.3, nu13: 0.3, nu23: 0.3, G12: G_ISO, G13: G_ISO, G23: G_ISO };
/** Constants reached at the end of steps 1 and 2. */
export const SCULPT_E1 = 400_000;
export const SCULPT_G12 = 300_000;

/** E along φ (degrees, from x), MPa. */
export const eAt = (d: LabDerived, deg: number) => directionalModuli(d.S2, d.C2, (deg * Math.PI) / 180).E;

/** Stiffest direction in the plane, degrees in [0, 180), and its modulus. */
export function stiffest(d: LabDerived): { deg: number; E: number } {
  let best = { deg: 0, E: 0 };
  for (let k = 0; k < 720; k++) {
    const E = eAt(d, k / 4);
    if (E > best.E) best = { deg: k / 4, E };
  }
  return best;
}

/** The only combination of G₁₂ and ν₁₂ that E(φ) depends on. */
export const shearTerm = (p: Record<string, number>) => 1 / p.G12 - (2 * p.nu12) / p.E1;
const H_BEFORE = 1 / SCULPT_G12 - (2 * 0.3) / SCULPT_E1;

const gpa = (v: number) => `${fmt(v / 1000, 4)} GPa`;
const ends = (_s: LabState, d: LabDerived): Array<[string, string]> => [
  ['E(0°)', gpa(eAt(d, 0))],
  ['E(45°)', gpa(eAt(d, 45))],
  ['E(90°)', gpa(eAt(d, 90))],
];

export const sculptE: Guide = {
  id: 'sculpt-e',
  track: 'Level 2',
  title: 'Can you sculpt E(φ)?',
  summary: 'Shape the directional stiffness of an orthotropic material with four constants: why 45° belongs to shear, how the stiffest direction can leave the axes, and what E(φ) cannot tell you.',
  steps: [
    {
      title: 'Stretch the circle',
      context: [
        'An orthotropic material that starts with the same values in every direction (E = 200 GPa, ν = 0.30), so E(φ) is a circle of 200 GPa. In this plane four of its constants shape E(φ): E₁, E₂, G₁₂ and ν₁₂. Axis 1 (teal) lies along x.',
      ],
      setup: (s) => fresh('ort-9b', s, { ...fibres, params: ISO_ORTHO }),
      show: ['directional'],
      predict: {
        question: 'If E₁ were doubled to 400 GPa, with every other constant unchanged, what would E be at 45°?',
        options: [
          { text: 'About 300 GPa, halfway between E₁ and E₂', feedback: 'The ends of the curve are E₁ and E₂, but the middle is governed mostly by something else.' },
          { text: 'About 210 GPa, barely above E₂', correct: true },
          { text: 'About 400 GPa, like E₁', feedback: 'Only the direction of axis 1 is pinned to E₁.' },
        ],
      },
      try: {
        instructions: ['Raise E₁ to about 400 GPa and watch the curve.'],
        controls: [{ kind: 'param', key: 'E1' }],
        readouts: ends,
        task: {
          goal: 'Raise E₁ to at least 380 GPa.',
          check: (s) => s.params.E1 >= 380_000,
          solve: (s) => withParam(s, 'E1', SCULPT_E1),
        },
      },
      explain: [
        'E(45°) is about 211 GPa: doubling E₁ barely moves the middle. In this plane, with φ measured from axis 1,',
        '$\\dfrac{1}{E(\\varphi)} = \\dfrac{\\cos^4\\varphi}{E_1} + \\dfrac{\\sin^4\\varphi}{E_2} + \\Big(\\dfrac{1}{G_{12}} - \\dfrac{2\\nu_{12}}{E_1}\\Big)\\sin^2\\varphi\\cos^2\\varphi$',
        'E₁ and E₂ pin the ends. Between them the shear term carries the most weight; at 45° it is the largest of the three contributions.',
      ],
    },
    {
      title: 'Off the axis',
      context: ['E₁ = 400 GPa and E₂ = 200 GPa, so axis 1 is the stiffest direction, for now.'],
      show: ['directional'],
      predict: {
        question: 'Could raising G₁₂ alone make some direction stiffer than axis 1?',
        options: [
          { text: 'No: nothing can be stiffer than the stiffest axis', feedback: 'The axes are where the constants are defined, not where the extremes have to be.' },
          { text: 'Yes: a direction between the axes', correct: true },
        ],
      },
      try: {
        instructions: [
          'Raise G₁₂ and watch the curve and its black ticks, which mark the directions where E(φ) is stationary. The slider has a snap point at $G_{12} = E_1/2(1+\\nu_{12})$.',
        ],
        controls: [{ kind: 'param', key: 'G12' }],
        extraSnaps: (s) => ({ G12: [{ value: s.params.E1 / (2 * (1 + s.params.nu12)), label: 'E₁/2(1+ν₁₂)' }] }),
        readouts: (_s, d) => {
          const top = stiffest(d);
          return [
            ['E_1', gpa(eAt(d, 0))],
            ['E_{\\max}', gpa(top.E)],
            ['\\varphi_{\\max}', `${fmt(top.deg <= 90 ? top.deg : top.deg - 180, 3)}°`],
          ];
        },
        task: {
          goal: 'Make some direction stiffer than E₁.',
          check: (s, d) => d.planeExt.Emax > 1.01 * s.params.E1,
          solve: (s) => withParam(s, 'G12', SCULPT_G12),
        },
      },
      observe: {
        question: 'Where is the stiffest direction now?',
        options: [
          { text: 'Still along axis 1', feedback: 'Read φ_max with the slider, or look for the outermost point of the curve.' },
          { text: 'Between axis 1 and 45°', correct: true },
          { text: 'At 45°', feedback: 'At 45° only if E₁ = E₂, as for a cubic crystal. Here the stiffer axis pulls the maximum toward itself.' },
          { text: 'Along axis 2', feedback: 'Axis 2 is still the softest direction: E(90°) = E₂.' },
        ],
      },
      explain: [
        'Symmetry only requires the axes to be stationary points of E(φ); whether they are maxima or minima is up to the constants. With $u = \\sin^2\\varphi$, $1/E$ is a quadratic in u whose slope at axis 1 is $1/G_{12} - 2(1+\\nu_{12})/E_1$. Once $G_{12} > E_1/2(1+\\nu_{12})$ (154 GPa here, the shear modulus an isotropic material with this E₁ and ν₁₂ would have), that slope turns negative: E rises as you leave axis 1, and the stiffest direction moves off it.',
        'Because E₁ > E₂, the maximum stays on axis 1’s side of 45°. A cubic crystal with A > 1 is the special case E₁ = E₂, with the maximum exactly at 45°.',
      ],
    },
    {
      title: 'What E(φ) cannot tell you',
      context: [
        'Now G₁₂ = 300 GPa and ν₁₂ = 0.30. In the formula for E(φ), G₁₂ and ν₁₂ appear only in one combination, $1/G_{12} - 2\\nu_{12}/E_1$.',
      ],
      show: ['directional'],
      try: {
        instructions: [
          'Set ν₁₂ to 0 (it snaps there) and watch E(φ) change. Then bring E(φ) back exactly with G₁₂, whose slider has a snap point marked “same E(φ)”.',
          'Then compare the G and ν views of the polar plot with what you remember, or switch ν₁₂ back and forth.',
        ],
        controls: [
          { kind: 'param', key: 'nu12' },
          { kind: 'param', key: 'G12' },
        ],
        extraSnaps: (s) => ({ G12: [{ value: 1 / (H_BEFORE + (2 * s.params.nu12) / s.params.E1), label: 'same E(φ)' }] }),
        readouts: ends,
        task: {
          goal: 'Set ν₁₂ = 0, with E(φ) exactly as before.',
          check: (s) => Math.abs(s.params.nu12) < 0.005 && Math.abs(shearTerm(s.params) - H_BEFORE) < 1e-4 * H_BEFORE,
          solve: (s) => {
            const t = withParam(s, 'nu12', 0);
            return withParam(t, 'G12', 1 / (H_BEFORE + (2 * t.params.nu12) / t.params.E1));
          },
        },
      },
      observe: {
        question: 'E(φ) is exactly as it was. Is the material the same?',
        options: [
          { text: 'Yes: the same E(φ) means the same material', feedback: 'Look at the G and ν views of the polar plot: G₁₂ is now 545 GPa and ν₁₂ is zero.' },
          { text: 'No: its shear moduli G(φ) and Poisson ratios ν(φ) are different', correct: true },
        ],
      },
      explain: [
        'Tensile tests that record only the axial strain, at any number of angles, measure E(φ) and nothing more, so they cannot separate G₁₂ from ν₁₂. To identify both, you also need the lateral strain (a transverse strain gauge gives ν(φ)) or a shear test.',
      ],
    },
    {
      title: 'A real crystal',
      context: [
        'A monoclinic crystal seen in its mirror plane: axes 1 (teal) and 2 are its crystal axes in that plane. A monoclinic crystal has no symmetry axis in this plane; its only 2-fold axis is normal to it.',
      ],
      setup: (s) => fresh('mon-13a', s, fibres),
      show: ['directional'],
      predict: {
        question: 'Will this crystal’s stiffest direction in this plane lie along one of its axes?',
        options: [
          { text: 'Yes, along axis 1', feedback: 'Axis 1 is a convenient choice for writing the constants, nothing more. In this plane symmetry does not single it out.' },
          { text: 'Yes, along axis 2', feedback: 'Nothing in this plane singles out axis 2 either.' },
          { text: 'Not necessarily: no symmetry fixes it in this plane', correct: true },
        ],
      },
      try: {
        instructions: ['Read the polar plot: the black ticks are the stationary directions of E(φ), and the teal line is axis 1.'],
        readouts: (_s, d) => {
          const top = stiffest(d);
          return [
            ['E_{\\max}', gpa(top.E)],
            ['\\varphi_{\\max}\\ \\text{from axis 1}', `${fmt(top.deg <= 90 ? top.deg : top.deg - 180, 3)}°`],
          ];
        },
      },
      explain: [
        'This crystal is stiffest about 24° from axis 1, at 251 GPa. In the mirror plane of a monoclinic crystal no direction is fixed by symmetry, so the extremes of E(φ) can sit anywhere. In the orthotropic material above the axes were always stationary, and the maximum still left them once G₁₂ was large enough.',
        'Crystal and material axes are a convenient frame for the constants, not a list of the stiffest directions.',
      ],
    },
  ],
};
