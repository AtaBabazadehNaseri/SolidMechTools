import type { Control } from '../mechanics';
import type { LabDerived, LabState } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, withExperiment } from './helpers';

const fibres = { overlays: { materialAxes: true, materialLines: true } };
const controls = (s: LabState, yy: Control, xy: Control) => s.load.control[0] === 'stress' && s.load.control[1] === yy && s.load.control[2] === xy;
const stiffness = (_s: LabState, d: LabDerived): Array<[string, string]> => [['d\\sigma_{xx}/d\\varepsilon_{xx}', `${fmt(d.apparentModulus.value / 1000, 4)} GPa`]];

export const holdingStiffer: Guide = {
  id: 'holding-stiffer',
  track: 'Level 2',
  title: 'Why does holding a specimen make it stiffer?',
  summary: 'One material, several stiffnesses: what changes when the sides, the shear or the thickness are held, why grips matter so much for an off-axis coupon, and why a hold can also change nothing.',
  steps: [
    {
      title: 'Hold the sides',
      context: [
        'A steel sheet in uniaxial tension: σxx on the x faces, every other face traction-free. The stiffness measured in this test, dσxx/dεxx, is Young’s modulus, E = 200 GPa.',
        'Clamping the y faces so that the sheet cannot narrow makes a different test of the same sheet.',
      ],
      setup: (s) => fresh('iso-steel', s, { magnification: 300 }),
      show: ['response'],
      predict: {
        question: 'With the y faces held so that εyy = 0, will the sheet be stiffer along x, softer, or the same?',
        options: [
          { text: 'Stiffer', correct: true },
          { text: 'The same: E is a material constant', feedback: 'E is the stiffness of one particular test, the one with everything else free. Holding the sides is a different test.' },
          { text: 'Softer', feedback: 'A hold only takes freedom away, and a body with less freedom to deform cannot be softer.' },
        ],
      },
      try: {
        instructions: ['Run the “Lateral constraint” test: the same σxx, with εyy held at zero.'],
        controls: [{ kind: 'experiments' }],
        readouts: stiffness,
        task: {
          goal: 'Run the “Lateral constraint” test.',
          check: (s) => controls(s, 'strain', 'stress'),
          solve: (s) => withExperiment(s, 'lock-yy'),
        },
      },
      observe: {
        question: 'What does it take to stop the sheet narrowing?',
        options: [
          { text: 'A tensile reaction σyy on the y faces', correct: true },
          { text: 'A compressive reaction σyy', feedback: 'Free, the sheet would narrow; stopping it takes a pull outward. Read the sign of σyy.' },
          { text: 'No force: a fixed edge just stays put', feedback: 'Holding a displacement takes whatever force it takes. Read the reaction σyy in the Response table.' },
        ],
      },
      explain: [
        'The reaction is $\\sigma_{yy} = \\nu\\,\\sigma_{xx}$, and its own Poisson effect shortens the sheet along x, so it stretches less: $d\\sigma_{xx}/d\\varepsilon_{xx} = E/(1-\\nu^2) = 219.8$ GPa, 10 % above E.',
        'Young’s modulus is the stiffness of one specific test: uniaxial stress, everything else free.',
      ],
    },
    {
      title: 'Hold the shear instead',
      context: ['Same steel sheet, with the y faces free again. This time the shear γxy is held at zero, as stiff grips would hold it.'],
      setup: (s) => withExperiment(s, 'uniaxial'),
      show: ['response'],
      try: {
        instructions: ['Run the “Shear constraint” test: σxx with γxy held at zero.'],
        controls: [{ kind: 'experiments' }],
        readouts: stiffness,
        task: {
          goal: 'Run the “Shear constraint” test.',
          check: (s) => controls(s, 'stress', 'strain'),
          solve: (s) => withExperiment(s, 'lock-xy'),
        },
      },
      observe: {
        question: 'What changed compared with the free test?',
        options: [
          { text: 'Nothing: no shear reaction, and the stiffness is still 200 GPa', correct: true },
          { text: 'It got stiffer, as with the sides held', feedback: 'Read dσxx/dεxx with the controls: it is back to E.' },
          { text: 'A shear reaction τxy appeared', feedback: 'Read τxy in the Response table: it is zero.' },
        ],
      },
      explain: [
        'Pulled along x, steel does not try to shear, so holding γxy at zero costs nothing: no reaction and no change. A hold stiffens a test only if the free specimen would have moved the way the hold forbids.',
      ],
    },
    {
      title: 'Grips on an off-axis coupon',
      context: [
        'A carbon/epoxy coupon with its fibres at 30° to the load. Free, it shears visibly under the pull ($\\gamma_{xy} \\approx -1.35\\,\\varepsilon_{xx}$) and its stiffness is $E_x = 28.8$ GPa. Stiff grips stop its ends from shearing.',
      ],
      setup: (s) => fresh('ortho-cfrp', s, { ...fibres, thetaDeg: 30 }),
      show: ['response'],
      predict: {
        question: 'With the shear held at zero, how much stiffer will the coupon be?',
        options: [
          { text: 'A few percent', feedback: 'That is what holding the sides does here. The shear this coupon is prevented from making is large, and so is the reaction that prevents it.' },
          { text: 'More than twice as stiff', correct: true },
          { text: 'No stiffer: the fibres carry the load either way', feedback: 'At 30° the fibres carry the load only partly; much of the free response is shear, which the grips now forbid.' },
        ],
      },
      try: {
        instructions: [
          'Run the “Shear constraint” test. The constraint ladder under the Response table then lists dσxx/dεxx for every combination of free and held εyy and γxy.',
        ],
        controls: [{ kind: 'experiments' }],
        show: ['ladder'],
        readouts: stiffness,
        task: {
          goal: 'Run the “Shear constraint” test.',
          check: (s) => controls(s, 'stress', 'strain'),
          solve: (s) => withExperiment(s, 'lock-xy'),
        },
      },
      observe: {
        question: 'For this coupon, which hold matters more?',
        options: [
          { text: 'Holding the shear γxy', correct: true },
          { text: 'Holding the sides εyy', feedback: 'Compare the two middle rows of the ladder: holding εyy alone adds about 2 %.' },
          { text: 'Both about equally', feedback: 'Compare the two middle rows of the ladder.' },
        ],
      },
      explain: [
        'With γxy held, a reaction $\\tau_{xy} \\approx 0.41\\,\\sigma_{xx}$ appears and the stiffness rises from 28.8 to 64.8 GPa, 2.25 times: $1/(\\bar S_{11} - \\bar S_{16}^2/\\bar S_{66})$ instead of $1/\\bar S_{11}$. Holding the sides adds only 2 %, because this coupon’s Poisson coupling is weak compared with its shear coupling.',
        'This is the classic end-constraint problem of off-axis tensile tests (Pagano & Halpin, 1968). Real grips hold only the ends, so the coupon bends into an S shape, and the measured modulus lies between the free and the fully held values; long, slender coupons come closer to the free one. This lab shows the two limits.',
      ],
    },
    {
      title: 'Hold the thickness',
      context: [
        'Back to steel in uniaxial tension, with the sides and the shear free. So far the sheet could change thickness (plane stress). In plane strain the thickness is held instead, εzz = 0, as in a long body constrained along z.',
      ],
      setup: (s) => fresh('iso-steel', s, { magnification: 300 }),
      show: ['response', 'ladder'],
      try: {
        instructions: ['Switch to plane strain and read dσxx/dεxx, and the ladder.'],
        controls: [{ kind: 'mode' }],
        readouts: stiffness,
        task: {
          goal: 'Switch to plane strain.',
          check: (s) => s.mode === 'strain',
          solve: (s) => ({ ...s, mode: 'strain' }),
        },
      },
      observe: {
        question: 'With only the thickness held, dσxx/dεxx reads 219.8 GPa. Where have you seen this number before?',
        options: [
          { text: 'In plane stress, with the sides held', correct: true },
          { text: 'Nowhere: holding the thickness gives a new constant', feedback: 'Look back at the first step of this guide.' },
          { text: 'It is E', feedback: 'E is 200 GPa, the free test in plane stress.' },
        ],
      },
      explain: [
        'By isotropy, holding z is the same as holding y: either way one lateral direction is held and the other is free, so both give $E/(1-\\nu^2)$. Holding both, the top of the ladder ($\\bar C_{11}$ in plane strain), gives the constrained modulus $E(1-\\nu)/\\big((1+\\nu)(1-2\\nu)\\big) = 269$ GPa.',
        'The rule behind every step: each hold adds a constraint, so the stiffness can only rise, from $1/\\bar S_{11}$ with everything free to $\\bar C_{11}$ with everything held, and it rises only if the free specimen would have used the freedom taken away. A measured modulus belongs to the material and the test together.',
      ],
    },
  ],
};
