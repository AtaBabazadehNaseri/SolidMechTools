import { kelvinModuli } from '../mechanics';
import { type LabDerived, type LabState, deriveLab, kelvinLoad } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, isAligned, kelvinModulusOf, withParam } from './helpers';

const crosses = { principalStress: true, principalStrain: true };
const ply = { overlays: { materialAxes: true, materialLines: true, ...crosses } };
const gpa = (v: number) => fmt(v / 1000, 4);
const list = (vs: number[]) => `${vs.map(gpa).join(', ')} GPa`;

const planeModuli = (_s: LabState, d: LabDerived): Array<[string, string]> => [['\\lambda\\ \\text{(in plane)}', list(d.kelvin2D.map((m) => m.modulus))]];
const allModuli = (s: LabState, d: LabDerived): Array<[string, string]> => [['\\lambda\\ \\text{(3D)}', list(kelvinModuli(d.S6))], ...planeModuli(s, d)];

/** Applies the in-plane mode with the largest (or smallest) modulus. */
const applyMode = (s: LabState, which: 'max' | 'min'): LabState => {
  const modes = deriveLab(s).kelvin2D;
  const pick = modes.reduce((a, m) => ((which === 'max' ? m.modulus > a.modulus : m.modulus < a.modulus) ? m : a));
  return { ...s, load: kelvinLoad(pick, s.scales) };
};

export const kelvinModes: Guide = {
  id: 'kelvin-modes',
  track: 'Level 3',
  title: 'Does a stiffness tensor have principal axes?',
  summary: 'The eigenmodes of a stiffness tensor (Kelvin modes): what they look like, why their moduli do not change with orientation, and how every admissible range ends where a Kelvin modulus reaches zero or infinity.',
  steps: [
    {
      title: 'Strains that map onto themselves',
      context: [
        'A stress tensor has principal directions: unit vectors n with $\\boldsymbol\\sigma\\mathbf n = \\lambda\\mathbf n$. A stiffness tensor maps strain tensors to stress tensors, so the analogous objects are strain states with $\\boldsymbol\\sigma = \\lambda\\boldsymbol\\varepsilon$, the stress being the strain times a number. In the plane there are three independent strain components, so a 2D stiffness has three such states, orthogonal to each other (Kelvin, 1856).',
        'The specimen is a sheet of an isotropic solid (E = 200 GPa, ν = 0.30) in plane stress.',
      ],
      setup: (s) => fresh('iso-2a', s, { overlays: crosses, magnification: 300 }),
      show: ['principal', 'response'],
      predict: {
        question: 'Which strain states of the isotropic sheet will give a stress exactly proportional to the strain?',
        options: [
          {
            text: 'Uniaxial strain, along any direction',
            feedback: 'Holding the lateral strain at zero takes a reaction σyy = C̄₁₂εxx, while σxx = C̄₁₁εxx. The two ratios differ, so σ is not a multiple of ε.',
          },
          { text: 'Equal stretching in every direction, and every pure shear', correct: true },
          { text: 'None: only stresses and strains have principal axes', feedback: 'The stiffness is a symmetric linear map on strains, so it has eigenvectors like any symmetric matrix.' },
        ],
      },
      try: {
        instructions: ['The three modes are now listed at the bottom of the panel on the right. Apply them one at a time with their buttons.'],
        show: ['kelvin'],
        readouts: planeModuli,
        task: {
          goal: 'Apply a Kelvin mode.',
          check: (_s, d) => kelvinModulusOf(d) !== null,
          solve: (s) => applyMode(s, 'min'),
        },
      },
      observe: {
        question: 'Two of the three moduli are equal (153.8 GPa). What do their modes have in common?',
        options: [
          { text: 'Both are pure shears, at 45° to each other', correct: true },
          { text: 'Both are uniaxial stretches', feedback: 'Apply them and look at the specimen: one axis stretches while the other shortens.' },
          { text: 'Nothing: the equality is a coincidence', feedback: 'It is forced by symmetry. Apply both and compare their principal strains.' },
        ],
      },
      explain: [
        'The modes are equal biaxial stretching, with λ = E/(1−ν) = 285.7 GPa, and pure shear, with λ = 2G = 153.8 GPa. The factor 2 appears because the tensor shear $\\varepsilon_{xy} = \\gamma_{xy}/2$ is the strain component here.',
        'The two shear modes share their λ, so every combination of them is a mode too: pure shear in every orientation. That degeneracy is in-plane isotropy. Formally, the λ are the eigenvalues of $\\bar{\\mathbf C}$ in Mandel form, where shear entries carry factors of √2 so that the strain components form an orthonormal basis.',
      ],
    },
    {
      title: 'A fibre composite',
      context: ['A fibre-composite ply with its fibres along x, in plane stress. Its shear modulus is G₁₂ = 7 GPa.'],
      setup: (s) => fresh('ort-9b', s, ply),
      show: ['principal', 'kelvin', 'response'],
      predict: {
        question: 'One of the ply’s three modes is a pure shear in its fibre axes. What will its modulus λ be?',
        options: [
          { text: 'G₁₂ = 7 GPa', feedback: 'With tensor shear as the strain component, a pure shear mode has λ = 2G.' },
          { text: '2G₁₂ = 14 GPa', correct: true },
          { text: 'E₂ = 10 GPa', feedback: 'That is close to the softest mode, which is a stretch, not a shear.' },
        ],
      },
      try: {
        instructions: ['Apply the three modes, ending with the stiffest one.'],
        readouts: planeModuli,
        task: {
          goal: 'Apply the stiffest mode.',
          check: (_s, d) => {
            const lam = kelvinModulusOf(d);
            const top = Math.max(...d.kelvin2D.map((m) => m.modulus));
            return lam !== null && Math.abs(lam - top) < 1e-6 * top;
          },
          solve: (s) => applyMode(s, 'max'),
        },
      },
      observe: {
        question: 'What does the stiffest mode look like?',
        options: [
          { text: 'Almost a pure stretch along the fibres', correct: true },
          { text: 'Equal stretching in both directions', feedback: 'Look at the specimen: the stretch across the fibres is tiny.' },
          { text: 'A pure shear', feedback: 'That is the middle mode.' },
        ],
      },
      explain: [
        'Aligned, an orthotropic ply decouples normal and shear components, so one mode is the pure shear (λ = 2G₁₂ = 14 GPa) and the other two mix ε₁₁ and ε₂₂. The stiffest is nearly pure fibre stretching (ε₂₂/ε₁₁ ≈ 0.018, λ = 181.0 GPa); the softest is nearly pure transverse stretching (λ = 10.0 GPa).',
      ],
    },
    {
      title: 'Turn the ply',
      context: ['The fibres lie along x, where $\\bar C_{11} = 180.9$ GPa.'],
      show: ['principal', 'kelvin', 'matrices'],
      predict: {
        question: 'If the fibres were turned to 30°, what would happen to the three moduli λ?',
        options: [
          { text: 'They would change, like C̄₁₁', feedback: 'C̄₁₁ is one entry in one frame. The λ are a property of the map itself.' },
          { text: 'They would stay the same, and the modes would turn with the fibres', correct: true },
          { text: 'The largest would drop to Eₓ at 30°', feedback: 'Eₓ is a free-test stiffness along x; λ is an eigenvalue of the whole stiffness.' },
        ],
      },
      try: {
        instructions: ['Rotate the fibres to 30° and compare the three λ with C̄₁₁.'],
        controls: [{ kind: 'theta' }],
        readouts: (s, d) => [['\\bar C_{11}', `${gpa(d.C2[0][0])} GPa`], ...planeModuli(s, d)],
        task: {
          goal: 'Rotate the fibres to 30°.',
          check: (s) => isAligned(s.thetaDeg, 30),
          solve: (s) => ({ ...s, thetaDeg: 30 }),
        },
      },
      explain: [
        '$\\bar C_{11}$ falls from 180.9 to 108.8 GPa while the three λ stay put. In Mandel form a rotation of the material is an orthogonal change of basis, $\\mathbf C \\to \\mathbf Q\\mathbf C\\mathbf Q^{\\mathsf T}$, which keeps eigenvalues. The entries describe the material in a frame; the Kelvin moduli describe the material.',
        'So yes, a stiffness tensor has principal axes: its modes, which are directions in the space of strains, with the λ as principal values (Mehrabadi & Cowin, 1990).',
      ],
    },
    {
      title: 'The edge of a band',
      context: [
        'Every material knob in this lab has a light band: the range that keeps the material stable, meaning that every deformation stores positive energy. In terms of modes, all six Kelvin moduli of the 3D stiffness are positive. For this isotropic solid they are 2G = 153.8 GPa (five shear modes) and 3K = 500 GPa (uniform dilatation).',
      ],
      setup: (s) => fresh('iso-2a', s, { overlays: crosses, magnification: 300 }),
      show: ['kelvin'],
      predict: {
        question: 'As the isotropic solid’s ν approaches ½, what will happen to these six moduli?',
        options: [
          { text: 'The dilatation modulus 3K will grow without bound', correct: true },
          { text: 'One of them will drop to zero', feedback: 'With E held fixed, ν → ½ makes the solid harder to compress, not softer.' },
          { text: 'All six will grow together', feedback: 'The shear moduli 2G = E/(1+ν) change only a little as ν goes from 0.3 to ½.' },
        ],
      },
      try: {
        instructions: ['Raise ν toward the upper end of its band and watch the six 3D moduli and the three in-plane ones, shown with the slider.'],
        controls: [{ kind: 'param', key: 'nu12' }],
        readouts: allModuli,
        task: {
          goal: 'Raise ν to 0.49 or more.',
          check: (s) => s.params.nu12 >= 0.49,
          solve: (s) => withParam(s, 'nu12', 0.49),
        },
      },
      observe: {
        question: 'What do the three in-plane moduli of the plane-stress sheet do meanwhile?',
        options: [
          { text: 'They stay finite', correct: true },
          { text: 'The largest grows without bound too', feedback: 'Read the in-plane values: the largest stays below 400 GPa.' },
          { text: 'They drop toward zero', feedback: 'Read the in-plane values shown with the slider.' },
        ],
      },
      explain: [
        'At ν = ½ the solid is incompressible: one mode, uniform dilatation, has become rigid. Past that edge 3K would be negative, and the solid would release energy when compressed. At the other edge, ν = −1, the five shear moduli become infinite. Every edge of every band is where some Kelvin modulus of the 3D stiffness reaches zero (a mode becomes free) or infinity (a mode becomes rigid); positive definiteness is exactly the requirement that none crosses.',
        'The plane-stress sheet can thin freely, so dilatation is never forced on it and its moduli stay finite (in plane strain the largest would diverge). Both 2D reductions keep their moduli between the smallest and largest 3D ones, by eigenvalue interlacing, so a 2D section can hide an edge but never move it.',
      ],
    },
    {
      title: 'How far can ν₁₂ go?',
      context: ['For an isotropic solid the band for ν is −1 < ν < ½. This fibre-composite ply has ν₁₂ = 0.30, and E₁/E₂ = 18.'],
      setup: (s) => {
        const t = fresh('ort-9b', s, ply);
        // Widen the slider to the whole admissible band, which reaches past the usual ±2.5.
        return { ...t, tracks: { ...t.tracks, nu12: { min: -4.5, max: 4.5, log: false } } };
      },
      show: ['kelvin'],
      predict: {
        question: 'How large can ν₁₂ be before this ply becomes unstable?',
        options: [
          { text: '½, as for an isotropic solid', feedback: 'The ½ comes from isotropy. Here the limit is set by the ratio of the two Young’s moduli.' },
          { text: '1', feedback: 'There is no general limit of 1 on a Poisson ratio of an anisotropic solid.' },
          { text: 'Well above 1: about 3.8', correct: true },
        ],
      },
      try: {
        instructions: ['Drag ν₁₂ toward the upper end of its band and watch the six 3D moduli.'],
        controls: [{ kind: 'param', key: 'nu12' }],
        readouts: (s, d) => [...allModuli(s, d), ['\\nu_{21} = \\nu_{12}E_2/E_1', fmt((s.params.nu12 * s.params.E2) / s.params.E1, 3)]],
        task: {
          goal: 'Raise ν₁₂ above 2.',
          check: (s) => s.params.nu12 > 2,
          solve: (s) => withParam(s, 'nu12', 3),
        },
      },
      observe: {
        question: 'Which 3D modulus heads for the edge?',
        options: [
          { text: 'The largest, which grows without bound', correct: true },
          { text: 'The smallest, which drops to zero', feedback: 'Read the 3D values: the smallest barely moves.' },
          { text: 'All six change together', feedback: 'Read the 3D values: five of them barely move.' },
        ],
      },
      explain: [
        'The limit comes mainly from the 1–2 pair: $\\nu_{12}\\nu_{21} < 1$ with $\\nu_{21} = \\nu_{12}E_2/E_1$, so $|\\nu_{12}| < \\sqrt{E_1/E_2} \\approx 4.2$. The out-of-plane Poisson couplings tighten this to about 3.8. Near the edge a stiff mode mixing ε₁₁ and ε₂₂ becomes rigid.',
        'So ν > ½ is not exotic in anisotropic materials; balanced angle-ply fibre-composite laminates can reach in-plane Poisson ratios above 1. The bounds −1 < ν < ½ are a statement about isotropy, not about elasticity.',
      ],
    },
  ],
};
