import { deriveLab } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, withParam } from './helpers';

const gpa = (v: number) => `${fmt(v / 1000, 4)} GPa`;

export const planeStressInput: Guide = {
  id: 'plane-stress-input',
  track: 'Level 3',
  title: 'Which 2D stiffness belongs in your plane-stress model?',
  summary: 'Why the in-plane block of the 3D C is the wrong plane-stress input, how large the error is, and why near-incompressibility can cause volumetric locking in displacement-based plane-strain elements.',
  steps: [
    {
      title: 'The tempting shortcut',
      context: [
        'You have the full 3D stiffness C of a fibre-composite ply and need a 2D plane-stress model of a thin ply. The shortcut is to copy its in-plane entries C₁₁, C₁₂, C₂₂, C₁₆, C₂₆ and C₆₆ into the 2D matrix.',
      ],
      setup: (s) => fresh('ort-9b', s, { overlays: { materialAxes: true, materialLines: true } }),
      show: ['matrices'],
      predict: {
        question: 'Is the in-plane (1, 2, 6) block of the 3D C the right plane-stress stiffness?',
        options: [
          { text: 'Yes: the in-plane entries are the in-plane entries', feedback: 'They are the right entries for a different constraint: εzz = 0, not σzz = 0.' },
          { text: 'No: plane stress needs the inverse of the in-plane block of S', correct: true },
          {
            text: 'Only if the material is isotropic',
            feedback: 'Even for an isotropic material the block of C is E(1−ν)/((1+ν)(1−2ν)), not the plane-stress E/(1−ν²).',
          },
        ],
      },
      explain: [
        'The badges on the matrices say it. In plane stress $\\bar{\\mathbf S}$ is the 3D block, and $\\bar{\\mathbf C}$ is “reduced”: its inverse, $\\bar{\\mathbf C} = (\\mathbf S_{[1,2,6]})^{-1}$. The in-plane block of $\\mathbf C$ is the plane-strain stiffness.',
      ],
    },
    {
      title: 'How wrong is the shortcut?',
      context: ['Plane strain uses exactly that 3D block, so switching the mode shows what the shortcut would give.'],
      show: ['matrices'],
      predict: {
        question: 'Will the plane-strain C̄ be stiffer or softer than the plane-stress one?',
        options: [
          { text: 'Stiffer', correct: true },
          { text: 'Softer', feedback: 'Holding εzz = 0 adds a constraint, and a constraint never makes a material softer.' },
          { text: 'The same', feedback: 'Only if the out-of-plane Poisson couplings ν₁₃ and ν₂₃ were zero.' },
        ],
      },
      try: {
        instructions: ['Switch to plane strain and compare C̄₁₁, C̄₁₂, C̄₂₂ and C̄₆₆ with their plane-stress values, shown with the switch.'],
        controls: [{ kind: 'mode' }],
        readouts: (s, d) => {
          const ps = deriveLab({ ...s, mode: 'stress' }).C2;
          return ([[0, 0, '11'], [0, 1, '12'], [1, 1, '22'], [2, 2, '66']] as const).map(([i, j, k]) => [
            `\\bar C_{${k}}`,
            `${gpa(d.C2[i][j])} (plane stress ${gpa(ps[i][j])})`,
          ]);
        },
        task: {
          goal: 'Switch to plane strain.',
          check: (s) => s.mode === 'strain',
          solve: (s) => ({ ...s, mode: 'strain' }),
        },
      },
      observe: {
        question: 'Which entry changes the most, relative to its plane-stress value?',
        options: [
          { text: 'C̄₁₁, along the fibres', feedback: 'It barely moves: compare the two values.' },
          { text: 'C̄₂₂, across the fibres', feedback: 'It rises by about a fifth. Another entry rises by much more.' },
          { text: 'C̄₁₂, the Poisson coupling', correct: true },
          { text: 'C̄₆₆, the in-plane shear stiffness', feedback: 'C̄₆₆ does not change at all: in-plane shear is not coupled to εzz for this ply.' },
        ],
      },
      explain: [
        'For this ply $\\bar C_{22}$ rises from 10.05 to 12.05 GPa (+20 %) and $\\bar C_{12}$ from 3.02 to 5.08 GPa (+69 %). $\\bar C_{11}$ barely moves (+1 %) because the fibres dominate it.',
        'Copying the 3D block into a plane-stress model therefore makes the ply too stiff across the fibres and gets its Poisson coupling wrong by more than half.',
        'The two are related by a Schur complement. With a the in-plane and b the out-of-plane components, $\\bar C_{\\mathrm{PS}} = C_{aa} - C_{ab}C_{bb}^{-1}C_{ba}$, where $C_{aa}$ is the plane-strain block. Plane stress subtracts a positive semi-definite term from it, which is why releasing the out-of-plane strains can only soften the response.',
        '“Stiffer” here is meant in the energy sense: the difference between the two matrices is positive semi-definite. Every diagonal entry rises, but an off-diagonal entry need not.',
      ],
    },
    {
      title: 'Near-incompressible material',
      context: ['Now an isotropic material (E = 200 GPa, ν = 0.30), in plane stress.'],
      setup: (s) => fresh('iso-2a', s),
      show: ['matrices'],
      predict: {
        question: 'As ν approaches ½, in which mode will C̄₁₁ grow without bound?',
        options: [
          { text: 'Plane stress', feedback: 'In plane stress C̄₁₁ = E/(1−ν²) stays finite at ν = ½: the sheet can thin freely.' },
          { text: 'Plane strain', correct: true },
          { text: 'Both', feedback: 'Only one of them forbids the thickness change.' },
        ],
      },
      try: {
        instructions: ['Raise ν toward ½ and switch between the modes, watching C̄₁₁.'],
        controls: [{ kind: 'mode' }, { kind: 'param', key: 'nu12' }],
        readouts: (s) => [
          ['\\bar C_{11}\\ \\text{plane stress}', gpa(deriveLab({ ...s, mode: 'stress' }).C2[0][0])],
          ['\\bar C_{11}\\ \\text{plane strain}', gpa(deriveLab({ ...s, mode: 'strain' }).C2[0][0])],
        ],
        task: {
          goal: 'In plane strain, raise ν to 0.49 or more.',
          check: (s) => s.mode === 'strain' && s.params.nu12 >= 0.49,
          solve: (s) => withParam({ ...s, mode: 'strain' }, 'nu12', 0.495),
        },
      },
      explain: [
        'In plane strain $\\bar C_{11} = E(1-\\nu)/\\big((1+\\nu)(1-2\\nu)\\big)$: at ν = 0.495 it is about 25 times the plane-stress value, and it is infinite at ½.',
        'That growth is constitutive: it is what the material does, and it is all this homogeneous lab shows. **Volumetric locking** is a separate, numerical effect in susceptible finite-element formulations. A near-incompressible plane-strain body must deform at almost constant area, low-order displacement elements cannot represent that well, and they come out far too stiff. Reduced or selective integration, B-bar, and mixed u–p formulations are the usual remedies.',
      ],
    },
    {
      title: 'A checklist for 2D input',
      context: [
        '**Plane stress** (thin plate, σzz = τyz = τxz = 0): $\\bar{\\mathbf C} = (\\mathbf S_{[1,2,6]})^{-1}$. For an orthotropic material aligned with its axes this gives the familiar $Q_{11} = E_1/(1-\\nu_{12}\\nu_{21})$ and so on.',
        '**Plane strain** (long body, εzz = γyz = γxz = 0): $\\bar{\\mathbf C} = \\mathbf C_{[1,2,6]}$, the in-plane block of the 3D stiffness.',
        'Rotating about the plate normal commutes with both reductions, so you may rotate the 3D matrix or the 2D one, provided you use one frame throughout.',
        'If the section has out-of-plane couplings (trigonal, triclinic, or a section that is not a symmetry plane), plane strain also implies reaction shear stresses τyz and τxz, listed in the Response table, which a purely 2D model never reports.',
      ],
      show: ['matrices'],
    },
  ],
};
