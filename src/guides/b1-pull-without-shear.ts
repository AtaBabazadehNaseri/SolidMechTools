import type { Guide } from './types';
import { fresh, shearPerStretch, unloaded, withExperiment, withParam } from './helpers';

const fibres = { overlays: { materialAxes: true, materialLines: true } };
const isAligned = (deg: number, target: number) => Math.abs((((deg - target) % 180) + 270) % 180 - 90) < 0.5;

export const pullWithoutShear: Guide = {
  id: 'pull-without-shear',
  track: 'Level 2',
  title: 'Can you pull on something without it shearing?',
  summary: 'Extension–shear coupling in an off-axis composite, where the no-shear directions are, and why they sit at the stationary points of E(φ).',
  steps: [
    {
      title: 'An aligned composite',
      body: [
        'A unidirectional carbon/epoxy ply (T300/5208). The teal lines are the fibres, here along x. Once you answer, the ply is pulled along x with every other traction zero.',
      ],
      setup: (s) => unloaded(fresh('ortho-cfrp', s, fibres)),
      show: ['matrices'],
      predict: {
        question: 'Pulled along its fibres, does the ply shear?',
        options: [
          { text: 'No', correct: true },
          {
            text: 'Yes, slightly',
            feedback: 'Shear would need a coupling entry (S̄₁₆). With the fibres on a symmetry axis, mirror symmetry forbids it: a skew one way would be exactly as justified as a skew the other way.',
          },
          {
            text: 'Yes, noticeably',
            feedback: 'Shear would need a coupling entry (S̄₁₆). With the fibres on a symmetry axis, mirror symmetry forbids it: a skew one way would be exactly as justified as a skew the other way.',
          },
        ],
        reveal: (s) => withExperiment(s, 'uniaxial'),
      },
      explain: [
        'Aligned with its symmetry axes, an orthotropic material has $\\bar S_{16} = \\bar S_{26} = 0$: tension produces only normal strains. The outlined column of $\\bar{\\mathbf S}$ is the one that carries this test.',
      ],
    },
    {
      title: 'Rotate the fibres',
      body: ['The load stays along x. Once you answer, the fibre angle unlocks.'],
      show: ['matrices', 'response'],
      predict: {
        question: 'Suppose the fibres were turned 30° away from the load. What would happen?',
        options: [
          {
            text: 'Still no shear: the load is still pure tension',
            feedback: 'It is pure tension in the specimen axes, but not in the fibre axes: there it has a shear part, τ₁₂ = −σxx sin θ cos θ. Turn the fibres and watch.',
          },
          { text: 'It shears, although no shear traction is applied', correct: true },
          {
            text: 'It can only shear if a shear traction is applied',
            feedback: 'A shear traction is one way to make it shear, not the only one. A material whose axes are not aligned with the load can turn stretch into shear.',
          },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Rotate the fibres to around 30° and watch γxy and the outline.',
        check: (_s, d) => Math.abs(shearPerStretch(d.response.strain)) > 0.05,
        solve: (s) => ({ ...s, thetaDeg: 30 }),
      },
      explain: [
        'In the specimen axes $\\bar S_{16} \\neq 0$, so $\\gamma_{xy} = \\bar S_{16}\\,\\sigma_{xx}$. The material did not change, only its representation in the loading frame. In fibre axes, a pull along x is a mixture of $\\sigma_{11}$, $\\sigma_{22}$ and $\\tau_{12}$.',
      ],
    },
    {
      title: 'Where can you pull without shear?',
      body: [
        'The polar plot shows E(φ), the stiffness under uniaxial stress along each direction φ. The dot is the load axis x.',
      ],
      show: ['directional', 'response'],
      predict: {
        question: 'Besides along the fibres, along which direction can you pull this ply without it shearing?',
        options: [
          { text: 'Nowhere else', feedback: 'An orthotropic ply has two mirror axes in this plane, not one.' },
          { text: 'Across the fibres (90°)', correct: true },
          { text: 'At 45°, halfway between', feedback: 'Halfway between the axes is where the coupling is large, not where it vanishes.' },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Find another fibre angle at which the pull along x produces no shear.',
        check: (s, d) => isAligned(s.thetaDeg, 90) && Math.abs(shearPerStretch(d.response.strain)) < 1e-6,
        solve: (s) => ({ ...s, thetaDeg: 90 }),
      },
      explain: [
        'Look at the black ticks on the polar plot: the no-shear directions are exactly where E(φ) is stationary. This is not a coincidence. The shear produced by a pull along φ is proportional to the slope of the compliance:',
        '$\\dfrac{\\gamma_{nt}}{\\varepsilon_{nn}} = \\tfrac12\\,E\\,\\dfrac{d(1/E)}{d\\varphi}$',
        'so it vanishes exactly at the maxima and minima of E(φ). Along those directions the strain is coaxial with the load.',
      ],
    },
    {
      title: 'A softer matrix',
      body: [
        'G₁₂ is governed mostly by the resin. Lower it and watch the shape of E(φ) and the ticks.',
      ],
      setup: (s) => fresh('ortho-cfrp', s, fibres),
      show: ['directional'],
      controls: [{ kind: 'param', key: 'G12' }],
      predict: {
        question: 'Can making the resin softer in shear create a new direction along which a pull does not shear?',
        options: [
          { text: 'Yes', correct: true },
          {
            text: 'No: only the symmetry axes can be such directions',
            feedback: 'Symmetry axes always qualify, but they are not the only candidates: any direction where E(φ) has a maximum or a minimum does too.',
          },
        ],
      },
      task: {
        goal: 'Lower G₁₂ until extra ticks appear on the polar plot.',
        check: (_s, d) => !d.coaxial.all && d.coaxial.angles.length >= 3,
        solve: (s) => withParam(s, 'G12', 4_000),
      },
      explain: [
        'Below $G_{12} \\approx 5.07$ GPa (for these E₁, E₂, ν₁₂) the minimum of E(φ) leaves the 90° direction and moves off-axis. The weakest direction is then neither along nor across the fibres, and pulling along it produces no shear either.',
        'The condition is $1/G_{12} > 2/E_2 + 2\\nu_{12}/E_1$. Composites with a compliant matrix often satisfy it.',
      ],
    },
    {
      title: 'Coupling built into the material',
      body: [
        'Some materials shear under tension even in their own axes. In this monoclinic material the coupling is a material constant, $\\eta_{12,1} = \\gamma_{12}/\\varepsilon_{1}$ under $\\sigma_1$.',
      ],
      setup: (s) => fresh('mono-coupled', s, fibres),
      show: ['matrices', 'response'],
      predict: {
        question: 'Drive η₁₂,₁ from positive through zero to negative. What happens to the skew?',
        options: [
          { text: 'It shrinks to zero and reverses direction', correct: true },
          { text: 'It shrinks to zero and stays there', feedback: 'Zero is a point on the way, not a limit: η is a signed constant.' },
          { text: 'It grows', feedback: 'The skew is proportional to η₁₂,₁. Its size follows |η| and its direction follows the sign.' },
        ],
      },
      controls: [{ kind: 'param', key: 'eta12_1' }],
      task: {
        goal: 'Make the specimen shear the other way (γxy < 0) under the same pull.',
        check: (_s, d) => d.response.strain[2] < 0,
        solve: (s) => withParam(s, 'eta12_1', -0.5),
      },
      explain: [
        'Under uniaxial stress the shear strain is $\\gamma_{xy} = \\eta_{12,1}\\,\\varepsilon_{xx}$: the sign of the coupling constant sets the direction of the skew. Like E and ν, η is a compliance quantity, read from a free (traction-controlled) test.',
        'So which stiffness entry would you expect to vanish when the skew does? That question is the next guide.',
      ],
    },
  ],
};
