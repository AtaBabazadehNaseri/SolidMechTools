import type { LabDerived, LabState } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, isAligned } from './helpers';

const fibres = { overlays: { materialAxes: true, materialLines: true } };
const moduli = (s: LabState, d: LabDerived): Array<[string, string]> => [
  ['E_1\\ \\text{(material)}', `${fmt(s.params.E1 / 1000, 4)} GPa`],
  ['E_x\\ \\text{(this test)}', `${fmt(d.plane.Ex / 1000, 4)} GPa`],
];
const onDiagonal = (deg: number) => Math.abs((((deg % 90) + 90) % 90) - 45) < 1;

export const e1VsEx: Guide = {
  id: 'e1-vs-ex',
  track: 'Level 1',
  title: 'What’s the difference between E₁ and Eₓ?',
  summary: 'E₁ belongs to the material, Eₓ to the test. How Eₓ changes as a fibre composite turns, why 45° is so soft, and what a few degrees of misalignment cost.',
  steps: [
    {
      title: 'Two kinds of label',
      context: [
        'Material constants carry the material’s own axis numbers. For this fibre-composite ply, axis 1 runs along the fibres (teal lines): E₁ = 180 GPa is Young’s modulus along the fibres and E₂ = 10 GPa across them.',
        'A test reports in the specimen axes x and y. Pulling along x with every other face free measures $E_x = \\sigma_{xx}/\\varepsilon_{xx}$. Right now the fibres lie along x, so $E_x = E_1$.',
      ],
      setup: (s) => fresh('ort-9b', s, fibres),
      show: ['response'],
      predict: {
        question: 'If the fibres were turned 90°, across the load, what would E₁ and Eₓ be?',
        options: [
          { text: 'E₁ = 180 GPa, as before; Eₓ = 10 GPa', correct: true },
          { text: 'Both 10 GPa', feedback: 'E₁ is a property of the material along its own axis 1. Turning the specimen does not change the material.' },
          { text: 'E₁ = 10 GPa; Eₓ = 180 GPa, as before', feedback: 'Eₓ is what the pull along x measures. With the fibres across x, that pull stretches the ply across its fibres.' },
        ],
      },
      try: {
        instructions: ['Rotate the fibres to 90° (slider, or drag the teal handle on the ring) and read both moduli.'],
        controls: [{ kind: 'theta' }],
        readouts: moduli,
        task: {
          goal: 'Turn the fibres across the load.',
          check: (s) => isAligned(s.thetaDeg, 90),
          solve: (s) => ({ ...s, thetaDeg: 90 }),
        },
      },
      explain: [
        'E₁ never changed: it is a constant of the material, measured along its axis 1. Eₓ is the result of one test in the specimen frame, and it depends on how the material sits in that frame. The two agree only when axis 1 lies along x.',
      ],
    },
    {
      title: 'Halfway round',
      context: ['The fibres are now across the load, and Eₓ = E₂.'],
      show: ['response'],
      predict: {
        question: 'If the fibres were at 45° to the load, roughly what would Eₓ be?',
        options: [
          {
            text: 'About 95 GPa, halfway between E₁ and E₂',
            feedback: 'Halfway would hold if the fibres and the resin shared every load evenly. At 45° the pull also shears the ply in its own axes, and the ply is soft in shear.',
          },
          { text: 'About 16 GPa, only a little above E₂', correct: true },
          { text: 'About 10 GPa, the same as E₂', feedback: 'Close, but the fibres still help a little at 45°.' },
        ],
      },
      try: {
        instructions: ['Rotate the fibres to 45° and read Eₓ.'],
        controls: [{ kind: 'theta' }],
        readouts: moduli,
        task: {
          goal: 'Put the fibres at 45° to the load.',
          check: (s) => onDiagonal(s.thetaDeg),
          solve: (s) => ({ ...s, thetaDeg: 45 }),
        },
      },
      explain: [
        'Eₓ(45°) = 16.3 GPa. At 45° a pull along x is, in the fibre axes, equal parts σ₁₁ and σ₂₂ plus a shear τ₁₂, and the compliances add:',
        '$\\dfrac{1}{E_x(45°)} = \\tfrac14\\Big(\\dfrac{1}{E_1} + \\dfrac{1}{E_2} + \\dfrac{1}{G_{12}} - \\dfrac{2\\nu_{12}}{E_1}\\Big)$',
        'The fibres are stiff, but the soft terms win: $1/G_{12}$ alone (G₁₂ = 7 GPa) is more than half of the sum. Off its axis, a composite is only as stiff as its resin lets it be.',
      ],
    },
    {
      title: 'Every angle at once',
      context: [
        'The rotation sweep repeats this same test at every fibre angle θ, with the pull fixed along x. Its curve is Eₓ(θ), and the dot marks the current angle.',
      ],
      show: ['response', 'sweep'],
      sweep: 'Ex',
      try: {
        instructions: ['Click the sweep at θ = 5° (or use the slider) to see what a small misalignment does.'],
        controls: [{ kind: 'theta' }],
        readouts: moduli,
        task: {
          goal: 'Set the fibres 5° off the load.',
          check: (s) => isAligned(s.thetaDeg, 5) || isAligned(s.thetaDeg, -5),
          solve: (s) => ({ ...s, thetaDeg: 5 }),
        },
      },
      observe: {
        question: 'How much of E₁ is left when the fibres are only 5° off the load?',
        options: [
          { text: 'Nearly all of it, about 99 %', feedback: 'Read Eₓ: 153 GPa of 180.' },
          { text: 'About 85 %', correct: true },
          { text: 'About half', feedback: 'That happens nearer 10°; read the sweep there.' },
        ],
      },
      explain: [
        'Eₓ falls fastest right next to the fibres: 15 % is lost at 5°, 41 % at 10° and 84 % at 30°. That is why fibre waviness and ply misalignments of a few degrees matter so much in composite parts, and why test coupons are cut and gripped with great care.',
      ],
    },
    {
      title: 'The polar plot and the sweep',
      context: [
        'The polar plot shows E(φ): the same free tensile test along every direction φ of the specimen plane, with the material held still. Its dot is the direction x. The sweep does the opposite: it keeps the pull along x and turns the material.',
      ],
      show: ['directional', 'sweep'],
      sweep: 'Ex',
      try: {
        instructions: ['Rotate the fibres slowly and watch both plots.'],
        controls: [{ kind: 'theta' }],
        readouts: moduli,
      },
      observe: {
        question: 'As the fibres turn, what does the polar plot do?',
        options: [
          { text: 'It turns with the fibres and keeps its shape, and its dot reads the value on the sweep', correct: true },
          { text: 'It changes shape', feedback: 'E(φ) is a property of the material; only its orientation in the specimen changes.' },
          { text: 'It stays put while the dot moves', feedback: 'Watch the teal material-axis line in the polar plot: it turns with the fibres, and the curve with it.' },
        ],
      },
      explain: [
        'The two plots hold the same information. Turning the material by θ under a fixed pull is the same as pulling at −θ in the material’s own axes: $E_x(\\theta) = E(-\\theta)$, read from the unrotated material’s polar plot. The sweep is the polar curve unrolled.',
      ],
    },
    {
      title: 'Equal axes, unequal Eₓ',
      context: ['A cubic crystal on its cube face, pulled along x. Its Young’s modulus is the same along all three cube axes: E₁ = E₂ = E₃ = 70.7 GPa.'],
      setup: (s) => fresh('cub-3a', s, fibres),
      show: ['response'],
      sweep: 'Ex',
      predict: {
        question: 'With equal moduli along its axes, will the crystal’s Eₓ change as it turns in this plane?',
        options: [
          { text: 'No: Eₓ = 70.7 GPa at every angle', feedback: 'Equal moduli along the axes say nothing about the directions between them.' },
          { text: 'Yes', correct: true },
        ],
      },
      try: {
        instructions: ['Look at the sweep, then rotate the crystal to 45° to read Eₓ along a face diagonal.'],
        show: ['sweep'],
        controls: [{ kind: 'theta' }],
        readouts: moduli,
        task: {
          goal: 'Rotate the crystal so that x runs along a face diagonal.',
          check: (s) => onDiagonal(s.thetaDeg),
          solve: (s) => ({ ...s, thetaDeg: 45 }),
        },
      },
      observe: {
        question: 'How does Eₓ along the face diagonal compare with E₁?',
        options: [
          { text: 'About twice as large', correct: true },
          { text: 'About the same', feedback: 'Compare the two readouts.' },
          { text: 'About half', feedback: 'Compare the two readouts: the diagonal is the stiffer one.' },
        ],
      },
      explain: [
        'Eₓ(45°) = 134 GPa, nearly twice E₁. Equal moduli along the axes do not make a material isotropic: the directions between the axes have their own stiffness, set here by the shear modulus. The guide “Why do two constants describe an isotropic solid?” shows why.',
      ],
    },
  ],
};
