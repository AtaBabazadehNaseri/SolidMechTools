import type { Guide } from './types';
import { fresh, shearPerStretch, withExperiment, withParam } from './helpers';
import type { LabState } from '../app/lab';

/**
 * Value of η₁₂,₁ that makes C̄₁₆ = 0 for this monoclinic material in its own
 * axes under plane stress. C̄₁₆ is a cofactor of S̄: C̄₁₆ ∝ S̄₁₂S̄₂₆ − S̄₂₂S̄₁₆,
 * which vanishes when S₁₆ = S₁₂S₂₆/S₂₂, i.e. η₁₂,₁ = −ν₁₂ η₁₂,₂.
 */
export const etaForZeroC16 = (s: LabState) => -s.params.nu12 * s.params.eta12_2;

const select = (s: LabState, matrix: 'C' | 'S'): LabState => ({ ...s, selected: { matrix, i: 0, j: 2 } });

export const c16StillShears: Guide = {
  id: 'c16-still-shears',
  track: 'Level 3',
  title: 'If C̄₁₆ = 0, can the specimen still shear?',
  summary: 'Why a zero coupling entry in the stiffness matrix does not mean a decoupled response, and which test each matrix answers.',
  steps: [
    {
      title: 'Zero the coupling entry',
      context: [
        'You are handed this in-plane stiffness for an FE model. The highlighted entry $\\bar C_{16}$ couples the normal strain $\\varepsilon_{xx}$ to the shear stress $\\tau_{xy}$. The specimen is pulled along x, traction-free otherwise, and it shears.',
      ],
      setup: (s) => select(fresh('mono-coupled', s, { overlays: { materialAxes: true }, magnification: 300 }), 'C'),
      show: ['matrices', 'response'],
      predict: {
        question: 'Suppose C̄₁₆ were exactly zero. Would this specimen still shear when pulled along x?',
        options: [
          {
            text: 'No: C̄₁₆ is the extension–shear coupling, so no coupling means no shear',
            feedback: 'That reads C̄₁₆ as “the” coupling. A free specimen’s shear is set by the compliance, which mixes several stiffness entries.',
          },
          { text: 'Yes, it could still shear', correct: true },
          { text: 'Only in plane strain', feedback: 'Plane strain changes the matrices but not the logic; if the effect exists, it already shows in plane stress.' },
        ],
      },
      try: {
        instructions: [
          'You cannot type into the matrix: it follows from the material constants. Use the coupling constant η₁₂,₁; its slider has a snap point marked “C̄₁₆ = 0”.',
        ],
        controls: [{ kind: 'param', key: 'eta12_1' }],
        extraSnaps: (s) => ({ eta12_1: [{ value: etaForZeroC16(s), label: 'C̄₁₆ = 0' }] }),
        task: {
          goal: 'Set η₁₂,₁ so that C̄₁₆ = 0.',
          check: (_s, d) => Math.abs(d.C2[0][2]) < 1e-6 * d.C2[2][2],
          solve: (s) => withParam(s, 'eta12_1', etaForZeroC16(s)),
        },
      },
      observe: {
        question: 'With C̄₁₆ = 0, what does the specimen do under the same pull?',
        options: [
          { text: 'It still shears, though much less', correct: true },
          { text: 'It no longer shears', feedback: 'Read γxy in the Response table, or look closely at the outline.' },
          { text: 'It shears just as much as before', feedback: 'Before, γxy was 0.8 εxx. Read it now in the Response table.' },
        ],
      },
      explain: [
        'C̄₁₆ is zero, and the specimen still shears: $\\gamma_{xy} = \\bar S_{16}\\,\\sigma_{xx} \\neq 0$. It is small here (γxy ≈ 0.075 εxx, down from 0.8 εxx) but it is not zero, and with other materials it can be large.',
      ],
    },
    {
      title: 'Why it still shears',
      context: ['The highlighted entry is now $\\bar S_{16}$: what a free test reads, $\\gamma_{xy} = \\bar S_{16}\\,\\sigma_{xx}$.'],
      setup: (s) => select(s, 'S'),
      show: ['matrices', 'response'],
      try: {
        instructions: ['Open “In terms of C̄” on the highlighted entry’s card (top right) to see how $\\bar S_{16}$ is built from the entries of $\\bar{\\mathbf C}$.'],
      },
      observe: {
        question: 'S̄₁₆ = (C̄₁₂C̄₂₆ − C̄₂₂C̄₁₆)/det C̄. With C̄₁₆ = 0, what is left?',
        options: [
          { text: 'Nothing: S̄₁₆ = 0', feedback: 'Only the second term vanishes.' },
          { text: 'C̄₁₂C̄₂₆ / det C̄', correct: true },
          {
            text: '1/C̄₁₆, which is infinite',
            feedback: 'Entries of S̄ are cofactors of C̄ divided by det C̄ (the adjugate formula, S̄ = adj C̄ / det C̄), not reciprocals of its entries.',
          },
        ],
      },
      explain: [
        'Stretching along x makes the free sheet strain along y (the $\\bar C_{12}$ path, because σyy must stay zero), and that y-strain is coupled to shear through $\\bar C_{26}$. In a free test the lateral strain and the shear are both free to develop, so an entry of $\\bar{\\mathbf S}$ collects every path through $\\bar{\\mathbf C}$.',
      ],
    },
    {
      title: 'The converse',
      context: ['Now the opposite question: make the free specimen stop shearing.'],
      setup: (s) => select(s, 'C'),
      show: ['matrices', 'response'],
      predict: {
        question: 'When the free specimen no longer shears, will C̄₁₆ be zero?',
        options: [
          { text: 'Yes', feedback: 'The cofactor rule works in reverse too: C̄₁₆ depends on S̄₁₂S̄₂₆ as well as on S̄₁₆.' },
          { text: 'No', correct: true },
        ],
      },
      try: {
        instructions: ['Drag η₁₂,₁ until the specimen pulls straight (the slider snaps at 0), then read C̄₁₆.'],
        controls: [{ kind: 'param', key: 'eta12_1' }],
        task: {
          goal: 'Make the specimen pull straight: γxy = 0 under σxx.',
          check: (_s, d) => Math.abs(shearPerStretch(d.response.strain)) < 1e-6,
          solve: (s) => withParam(s, 'eta12_1', 0),
        },
      },
      explain: [
        'Now $\\bar S_{16} = 0$ but $\\bar C_{16} \\neq 0$. By the same cofactor rule, $\\bar C_{16} \\propto \\bar S_{12}\\bar S_{26} - \\bar S_{22}\\bar S_{16}$, and the first term survives.',
      ],
    },
    {
      title: 'Where C̄₁₆ shows up',
      context: [
        'If the free specimen does not shear, where does the nonzero C̄₁₆ appear? In the test that defines it: prescribe εxx and hold every other in-plane strain at zero.',
      ],
      show: ['matrices', 'loads', 'response'],
      try: {
        instructions: ['Run the “Uniaxial strain” test (displacement-controlled).'],
        controls: [{ kind: 'experiments' }],
        task: {
          goal: 'Run the “Uniaxial strain” test.',
          check: (s, d) => s.load.control.every((c) => c === 'strain') && Math.abs(d.response.stress[2]) > 1e-3 * s.scales.stress,
          solve: (s) => withExperiment(s, 'uniaxial-strain'),
        },
      },
      observe: {
        question: 'Which reactions appear under uniaxial strain?',
        options: [
          { text: 'σyy and a shear reaction τxy', correct: true },
          { text: 'Only σyy', feedback: 'Read τxy in the Response table.' },
          { text: 'None: the specimen does not want to shear, so nothing needs to hold it', feedback: 'Holding a strain at zero takes whatever traction it takes; read the reaction column.' },
        ],
      },
      explain: [
        'A shear reaction $\\tau_{xy} = \\bar C_{16}\\,\\varepsilon_{xx}$ appears. This is a different experiment, not evidence that the free specimen was trying to shear; it was not. With the lateral strain held too, stretching along x would produce shear through C̄₁₆ if γxy were released, so holding γxy takes this reaction.',
        '**Take-away for FE input:** entries of $\\bar{\\mathbf S}$ answer free, traction-controlled tests, and entries of $\\bar{\\mathbf C}$ answer fully constrained ones. A single zero coupling entry in the stiffness matrix does not guarantee zero coupling in a free test (only C̄₁₆ = C̄₂₆ = 0 together does). To judge coupling, look at the compliance, or at the eigenmodes.',
      ],
    },
  ],
};
