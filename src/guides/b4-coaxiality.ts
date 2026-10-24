import { deriveLab, kelvinLoad } from '../app/lab';
import type { Guide } from './types';
import { fresh, kelvinModulusOf, principalGap, unloaded, withExperiment } from './helpers';

const crosses = { principalStress: true, principalStrain: true };
const ply = { overlays: { materialAxes: true, materialLines: true, ...crosses } };

export const coaxiality: Guide = {
  id: 'coaxiality',
  track: 'Level 2',
  title: 'Are stress and strain always coaxial?',
  summary: 'Principal axes of stress and strain coincide in an isotropic solid but not in general: which way the strain axes tilt, the loadings that keep them together, and the states where stress is exactly proportional to strain.',
  steps: [
    {
      title: 'Any load on an isotropic sheet',
      context: [
        'A sheet of an isotropic solid in uniaxial tension. The solid cross shows the principal directions of the stress, the dashed cross those of the strain. Two tensors are coaxial when their principal directions coincide.',
      ],
      setup: (s) => fresh('iso-2a', s, { overlays: crosses, magnification: 300 }),
      show: ['response'],
      predict: {
        question: 'Is there any combination of in-plane tractions for which this isotropic sheet’s strain would not be coaxial with its stress?',
        options: [
          { text: 'No, never', correct: true },
          { text: 'Yes, when shear and normal tractions are combined', feedback: 'Combine them below and watch the two crosses.' },
          { text: 'Yes, under pure shear', feedback: 'Try it below: pure shear is tension and compression at 45°, and an isotropic sheet answers along the same 45°.' },
        ],
      },
      try: {
        instructions: [
          'Combine tractions in the Boundary conditions panel: for example add a shear τxy to the pull σxx, or a σyy of either sign. Watch the two crosses, and the Principal axes panel.',
        ],
        show: ['loads', 'principal'],
        task: {
          goal: 'Apply a load with both σxx and τxy clearly nonzero.',
          check: (s, d) => Math.abs(d.response.stress[0]) > 0.1 * s.scales.stress && Math.abs(d.response.stress[2]) > 0.1 * s.scales.stress,
          solve: (s) => ({ ...s, load: { control: ['stress', 'stress', 'stress'], value: [s.scales.stress, 0, 0.5 * s.scales.stress] } }),
        },
      },
      observe: {
        question: 'What angle separates the two crosses?',
        options: [
          { text: 'None: they coincide', correct: true },
          { text: 'A few degrees', feedback: 'Read the coaxiality line in the Principal axes panel.' },
          { text: 'It depends on the load', feedback: 'Change the tractions again: the crosses move together.' },
        ],
      },
      explain: [
        'For an isotropic solid $\\boldsymbol\\varepsilon = \\dfrac{1+\\nu}{E}\\,\\boldsymbol\\sigma - \\dfrac{\\nu}{E}(\\operatorname{tr}\\boldsymbol\\sigma)\\,\\mathbf I$: the strain is the stress scaled, plus a multiple of the identity, and neither changes principal directions. Every loading is coaxial.',
      ],
    },
    {
      title: 'An off-axis ply',
      context: [
        'A fibre-composite ply with its fibres at 30° to x (teal lines). Once you answer, it is pulled along x, so the principal stress lies along x.',
      ],
      setup: (s) => unloaded(fresh('ort-9b', s, { ...ply, thetaDeg: 30 })),
      show: ['principal'],
      predict: {
        question: 'Where will the larger principal strain point?',
        options: [
          { text: 'Along the load, like the stress', feedback: 'That needs a material with no preferred direction, or a pull along a symmetry axis.' },
          { text: 'Tilted from the load toward the fibres', feedback: 'The fibres are the stiffest direction: the ply stretches least along them.' },
          { text: 'Tilted from the load away from the fibres', correct: true },
        ],
        reveal: (s) => withExperiment(s, 'uniaxial'),
      },
      explain: [
        'The larger principal strain points about 24° from the load, on the side away from the fibres. The ply is stiff along its fibres and compliant across them and in shear, so it stretches most in directions away from the fibres: strain follows the compliance, not just the load.',
      ],
    },
    {
      title: 'Bringing them together',
      context: ['The same ply, now in pure shear: the principal stresses lie at ±45° to x. With the fibres at 30°, the crosses do not coincide.'],
      setup: (s) => withExperiment(s, 'shear'),
      show: ['principal'],
      try: {
        instructions: ['Rotate the fibres until the two crosses coincide, then try other angles too.'],
        controls: [{ kind: 'theta' }],
        task: {
          goal: 'Find a fibre angle at which stress and strain are coaxial under pure shear.',
          check: (_s, d) => {
            const g = principalGap(d);
            return g !== null && g < 0.05;
          },
          solve: (s) => ({ ...s, thetaDeg: 45 }),
        },
      },
      observe: {
        question: 'At which fibre angles do the crosses coincide under pure shear?',
        options: [
          { text: 'Only at ±45°, with a principal stress along the fibres', feedback: 'Try 0° and 90° as well.' },
          { text: 'Every 45°: at 0°, ±45° and 90°', correct: true },
          { text: 'At every angle', feedback: 'At 30° they were apart; try a few more angles.' },
        ],
      },
      explain: [
        'There are two different reasons. At ±45° the principal stresses lie along and across the fibres, the ply’s own axes, where tension and compression cause no shear. At 0° and 90° the shear acts in the ply’s own axes, and pure shear in those axes produces pure shear strain.',
        'Both are the same rule: load an orthotropic material with a stress whose principal axes are its symmetry axes, or whose only component is a shear in them, and nothing couples normal and shear parts.',
      ],
    },
    {
      title: 'Stress proportional to strain',
      context: [
        'Coaxial means the same principal directions. A stronger agreement is $\\boldsymbol\\sigma = \\lambda\\boldsymbol\\varepsilon$: the stress is the strain times a number, so the principal values are in the same ratio as well. The states with this property are the stiffness’s own eigenmodes, the Kelvin modes, listed at the bottom of the panel on the right. The fibres are back at 30°.',
      ],
      setup: (s) => fresh('ort-9b', s, { ...ply, thetaDeg: 30 }),
      show: ['principal', 'kelvin'],
      try: {
        instructions: ['Apply each of the three modes with its button, and watch the specimen, the crosses and the Mohr circles (switch Mohr between stress and strain).'],
        task: {
          goal: 'Apply a Kelvin mode.',
          check: (_s, d) => kelvinModulusOf(d) !== null,
          solve: (s) => {
            const modes = deriveLab(s).kelvin2D;
            const top = modes.reduce((a, m) => (m.modulus > a.modulus ? m : a));
            return { ...s, load: kelvinLoad(top, s.scales) };
          },
        },
      },
      observe: {
        question: 'Apply the stiffest mode (the largest λ). What does its strain look like?',
        options: [
          { text: 'Almost a pure stretch along the fibres', correct: true },
          { text: 'A stretch along x, the load axis', feedback: 'The modes belong to the material, not to the specimen: they turned with the fibres.' },
          { text: 'A pure shear', feedback: 'That is the middle mode, λ = 2G₁₂. Apply the largest one.' },
        ],
      },
      explain: [
        'In every Kelvin mode stress and strain are coaxial, and more: proportional. The reverse does not hold. A pull along a no-shear direction is coaxial, but its stress is uniaxial while its strain is not, so it is not a mode. Coaxial states are common; proportional ones are just three in the plane, unless two of the λ coincide.',
        'What the modes say about a stiffness tensor is the subject of the Level 3 guide “Does a stiffness tensor have principal axes?”.',
      ],
    },
  ],
};
