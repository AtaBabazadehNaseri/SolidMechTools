import type { Guide } from './types';
import { deriveLab } from '../app/lab';
import { fmt } from '../app/format';
import { fresh, unloaded, withExperiment, withParam } from './helpers';

/** θ is a face diagonal of the cube face: 45° modulo 90°. */
const onDiagonal = (deg: number) => Math.abs((((deg % 90) + 90) % 90) - 45) < 1;

export const negativePoisson: Guide = {
  id: 'negative-poisson',
  track: 'Level 1',
  title: 'Can a solid get wider when you stretch it?',
  summary: "Poisson's ratio from ordinary to auxetic, why −1 < ν < ½, and a cubic crystal for which those isotropic bounds stop applying.",
  steps: [
    {
      title: 'Pull on an isotropic sheet',
      context: [
        'This is a thin sheet of an isotropic solid, not yet loaded. Once you answer, a tensile traction (blue arrows) is applied to the x faces; every other face stays traction-free.',
      ],
      setup: (s) => unloaded(fresh('iso-2a', s, { magnification: 300 })),
      show: ['response'],
      predict: {
        question: 'This solid has a Poisson’s ratio ν = 0.30, typical of many metals. Stretched along x, what will the sheet do along y?',
        options: [
          { text: 'It gets narrower', correct: true },
          { text: 'It keeps its width', feedback: 'That would need ν = 0, which is unusual for a metal. Look at the outline and at εyy.' },
          { text: 'It gets wider', feedback: 'That would need a negative ν; this one is +0.30. Look at the outline and at εyy.' },
        ],
        reveal: (s) => withExperiment(s, 'uniaxial'),
      },
      explain: [
        "It contracts: $\\varepsilon_{yy} = -\\nu\\,\\varepsilon_{xx}$ with Poisson's ratio $\\nu = 0.30$. Poisson's ratio is defined in exactly this test, where only $\\sigma_{xx}$ acts and everything else is free to move.",
      ],
    },
    {
      title: 'Turn the Poisson knob',
      context: ['Poisson’s ratio is a material constant, so in this lab it is a knob. The sheet stays loaded as before.'],
      show: ['response'],
      try: {
        instructions: ['Drag ν toward zero and watch the outline, and εyy and εzz in the Response table.'],
        controls: [{ kind: 'param', key: 'nu12' }],
        task: {
          goal: 'Set ν = 0 (the slider snaps there).',
          check: (s) => Math.abs(s.params.nu12) < 0.005,
          solve: (s) => withParam(s, 'nu12', 0),
        },
      },
      observe: {
        question: 'At ν = 0, what does the stretched sheet do across its width and its thickness?',
        options: [
          { text: 'It keeps both: εyy = εzz = 0', correct: true },
          { text: 'It keeps its width but still gets thinner', feedback: 'Read εzz in the Response table: an isotropic solid has one ν for every pair of directions.' },
          { text: 'It still narrows, only less', feedback: 'Read εyy in the Response table: it is zero.' },
        ],
      },
      explain: [
        'At $\\nu = 0$ the sheet stretches without narrowing or thinning. Cork is close to this (ν ≈ 0), which is one reason it makes a good bottle stopper: pushed in, it does not bulge sideways against the neck.',
      ],
    },
    {
      title: 'Go negative',
      context: ['The knob does not stop at zero.'],
      show: ['response'],
      predict: {
        question: 'What will happen once ν is negative?',
        options: [
          { text: 'The sheet gets wider when stretched', correct: true },
          {
            text: 'The material becomes unstable',
            feedback: 'Stability needs positive bulk and shear moduli, and both stay positive just below zero. The limit is further away; the next step finds it.',
          },
          { text: 'Nothing: ν cannot go below zero', feedback: 'Positive ν is common, not required. Nothing about ν = 0 is special to stability.' },
        ],
      },
      try: {
        instructions: ['Keep dragging ν past zero and watch the outline.'],
        controls: [{ kind: 'param', key: 'nu12' }],
        task: {
          goal: 'Make ν clearly negative (below −0.3).',
          check: (s) => s.params.nu12 < -0.3,
          solve: (s) => withParam(s, 'nu12', -0.5),
        },
      },
      explain: [
        'A negative Poisson ratio means the material widens when stretched and narrows when compressed. Such materials are called **auxetic**. Re-entrant foams reach ν ≈ −0.7 (Lakes, 1987); auxetic lattices and some honeycombs do the same by unfolding their cells.',
      ],
    },
    {
      title: 'How far can ν go?',
      context: ['You have taken ν from 0.30 to below −0.3, and the sheet still behaves sensibly.'],
      show: ['matrices', 'response'],
      predict: {
        question: "For an isotropic solid, which values of Poisson's ratio are physically allowed?",
        options: [
          { text: '0 < ν < ½', feedback: 'You just made ν negative and nothing broke.' },
          { text: '−1 < ν < ½', correct: true },
          { text: '−1 < ν < 1', feedback: 'That is the limit for a 2D sheet considered on its own. The real solid also has a thickness direction.' },
          { text: 'Any value', feedback: 'Some values would let the material release energy as it deforms. The next part shows where.' },
        ],
      },
      try: {
        instructions: [
          'The light band on the slider is the range that keeps the material stable. Drag ν to both ends of the band and watch the bulk modulus K and the shear modulus G shown with the slider.',
        ],
        controls: [{ kind: 'param', key: 'nu12' }],
        readouts: (s, d) => {
          const E = s.params.E1;
          const nu = s.params.nu12;
          return [
            ['K = E/3(1-2\\nu)', `${fmt(E / (3 * (1 - 2 * nu)) / 1000, 4)} GPa`],
            ['G = E/2(1+\\nu)', `${fmt(E / (2 * (1 + nu)) / 1000, 4)} GPa`],
            ['\\bar C_{11}\\ \\text{(plane stress)}', `${fmt(d.C2[0][0] / 1000, 4)} GPa`],
          ];
        },
        task: {
          goal: 'Take ν close to an end of the band: above 0.49 or below −0.95.',
          check: (s) => s.params.nu12 >= 0.49 || s.params.nu12 <= -0.95,
          solve: (s) => withParam(s, 'nu12', 0.49),
        },
      },
      observe: {
        question: 'What happens to K and G at the two ends of the band?',
        options: [
          { text: 'K grows without bound toward ½, G toward −1', correct: true },
          { text: 'G grows without bound toward ½, K toward −1', feedback: 'Drag ν to each end and read the two moduli again.' },
          { text: 'Both drop to zero at the ends', feedback: 'With E held fixed they grow, they do not drop: read the values shown with the slider.' },
        ],
      },
      explain: [
        'Stability needs positive bulk and shear moduli: $K = E/3(1-2\\nu) > 0$ and $G = E/2(1+\\nu) > 0$, so $-1 < \\nu < \\tfrac12$.',
        'Near ½, K → ∞: the material becomes incompressible. Near −1, G → ∞: it becomes infinitely stiff in shear (with E held fixed).',
        'The plane-stress $\\bar C_{11} = E/(1-\\nu^2)$ diverges at −1 but stays finite as ν → ½, because the sheet can still change thickness. That is also why a 2D sheet considered on its own would allow ν up to 1: the limit of ½ comes from the thickness direction.',
      ],
    },
    {
      title: 'A crystal that gets wider',
      context: [
        'Polycrystalline metals are close to isotropic, but a single crystal is not. This cubic crystal’s Poisson ratio depends on the direction you pull and the direction you measure. Pulled along a cube axis ⟨100⟩, its in-plane ν = 0.41. Pulled along a face diagonal ⟨110⟩ and measured across the other face diagonal, ν = −0.11.',
        'The teal arrows and lines are the crystal’s cube axes. The load is along x, which is now a cube axis.',
      ],
      // The in-plane widening is only 11 % of the stretch, so magnify enough to see it.
      setup: (s) => fresh('cub-3a', s, { overlays: { materialAxes: true, materialLines: true }, magnification: 800 }),
      show: ['response'],
      predict: {
        question: 'Suppose the crystal is turned so that the pull runs along a face diagonal. Which ν applies, and what happens to the width?',
        options: [
          {
            text: 'ν = 0.41, since it is still the same crystal: the sheet narrows',
            feedback: 'In an anisotropic crystal ν belongs to a pair of directions, not to the material alone. Pulling along ⟨110⟩ and measuring across it is the pair with ν = −0.11.',
          },
          { text: 'ν = −0.11: the sheet gets slightly wider', correct: true },
          { text: 'ν = −0.11: the sheet narrows, but less', feedback: 'A negative ν means εyy has the same sign as εxx: under tension the width grows.' },
        ],
      },
      try: {
        instructions: ['Rotate the crystal by 45° so that x runs along ⟨110⟩, and watch the outline and the Poisson ratios shown with the slider.'],
        controls: [{ kind: 'theta' }],
        readouts: (s, d) => [
          ['\\nu_{xy}', fmt(d.plane.nuxy, 3, 1e-9)],
          ['\\nu_{xz}', fmt(d.constants.nuxz, 3, 1e-9)],
          ['\\nu_{xz}\\ (\\theta = 0)', fmt(deriveLab({ ...s, thetaDeg: 0 }).constants.nuxz, 3)],
        ],
        task: {
          goal: 'Rotate the crystal so that x runs along a face diagonal.',
          check: (s, d) => onDiagonal(s.thetaDeg) && d.response.strain[1] > 0,
          solve: (s) => ({ ...s, thetaDeg: 45 }),
        },
      },
      observe: {
        question: 'While the width grows, what does the thickness do, compared with the pull along the cube axis?',
        options: [
          { text: 'It contracts much more', correct: true },
          { text: 'About the same', feedback: 'Compare ν_xz now with its value at θ = 0, both shown with the slider.' },
          { text: 'It gets thicker too', feedback: 'Read εzz in the Response table: it is negative.' },
        ],
      },
      explain: [
        'Along ⟨110⟩ this crystal is auxetic in the plane, $\\nu_{xy} \\approx -0.11$, while its thickness contracts strongly, $\\nu_{xz} \\approx 0.78$, nearly twice the cube-axis value. Many cubic metal crystals have such a direction (Baughman et al., Nature 392, 1998).',
        'The isotropic bounds −1 < ν < ½ do not apply to anisotropic materials: their directional Poisson ratios can fall well outside them.',
      ],
    },
    {
      title: 'Hold the thickness',
      context: [
        'So far the sheet has been free to change thickness (plane stress). The crystal stays along ⟨110⟩. In plane strain the thickness is held instead, εzz = 0, as in a long body constrained along z.',
      ],
      show: ['response'],
      predict: {
        question: 'With the thickness held, will the crystal still get wider along y?',
        options: [
          {
            text: 'Yes, nothing in the plane changed',
            feedback: 'The underlying 3D material constants did not change, but the constraint did, and with it the effective 2D constants: holding the thickness takes a reaction σzz, which acts back on the in-plane strains.',
          },
          { text: 'No, it contracts', correct: true },
        ],
      },
      try: {
        instructions: ['Switch to plane strain and look at εyy and at the reaction σzz in the Response table.'],
        controls: [{ kind: 'mode' }],
        task: {
          goal: 'Switch to plane strain.',
          check: (s, d) => s.mode === 'strain' && d.response.strain[1] < 0,
          solve: (s) => ({ ...s, mode: 'strain' }),
        },
      },
      observe: {
        question: 'What does it take to hold the thickness?',
        options: [
          { text: 'A tensile reaction σzz, about 0.41 σxx', correct: true },
          { text: 'A compressive reaction σzz', feedback: 'Free, the sheet would get thinner; holding it takes a pull. Read the sign of σzz.' },
          { text: 'No reaction at all', feedback: 'Free, the thickness strain was large (ν_xz ≈ 0.78). Holding it at zero takes a stress: read σzz.' },
        ],
      },
      explain: [
        'Free, the sheet would thin strongly ($\\nu_{xz} \\approx 0.78$). Holding εzz = 0 therefore takes a tensile reaction $\\sigma_{zz} \\approx 0.41\\,\\sigma_{xx}$, and that σzz contracts the sheet along y through the ordinary Poisson coupling between [001] and ⟨110⟩. This outweighs the in-plane auxetic tendency.',
        'Whether a material looks auxetic depends on what else is constrained: the same crystal, pulled the same way, contracts here.',
      ],
    },
  ],
};
