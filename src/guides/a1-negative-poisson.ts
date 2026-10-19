import type { Guide } from './types';
import { fresh, unloaded, withExperiment, withParam } from './helpers';

export const negativePoisson: Guide = {
  id: 'negative-poisson',
  track: 'Level 1',
  title: 'Can a solid get wider when you stretch it?',
  summary: "Poisson's ratio from ordinary to auxetic, why −1 < ν < ½, and a common metal that breaks the rule.",
  steps: [
    {
      title: 'Pull on steel',
      body: [
        'This is a thin sheet of steel, not yet loaded. Once you answer, a tensile traction (blue arrows) is applied to the x faces; every other face stays traction-free.',
      ],
      setup: (s) => unloaded(fresh('iso-steel', s, { magnification: 300 })),
      show: ['response'],
      predict: {
        question: 'Stretched along x, what will the sheet do along y?',
        options: [
          { text: 'It gets narrower', correct: true },
          { text: 'It keeps its width', feedback: 'That would need ν = 0, which is unusual for a metal. Look at the outline and at εyy.' },
          { text: 'It gets wider', feedback: 'That would need a negative ν; steel’s is +0.30. Look at the outline and at εyy.' },
        ],
        reveal: (s) => withExperiment(s, 'uniaxial'),
      },
      explain: [
        "It contracts: $\\varepsilon_{yy} = -\\nu\\,\\varepsilon_{xx}$ with Poisson's ratio $\\nu = 0.30$. Poisson's ratio is defined in exactly this test, where only $\\sigma_{xx}$ acts and everything else is free to move.",
      ],
    },
    {
      title: 'Turn the Poisson knob',
      body: ['ν is now unlocked. Drag it toward zero and watch the width of the sheet.'],
      show: ['response'],
      controls: [{ kind: 'param', key: 'nu12' }],
      task: {
        goal: 'Make the sheet keep its width exactly (εyy = 0). The slider snaps at 0.',
        check: (s) => Math.abs(s.params.nu12) < 0.005,
        solve: (s) => withParam(s, 'nu12', 0),
      },
      explain: [
        'At $\\nu = 0$ the sheet stretches without narrowing. Cork is close to this (ν ≈ 0), which is one reason it makes a good bottle stopper: pushed in, it does not bulge sideways against the neck.',
      ],
    },
    {
      title: 'Go negative',
      body: ['Keep going past zero.'],
      show: ['response'],
      predict: {
        question: 'What should happen once ν is negative?',
        options: [
          { text: 'The sheet gets wider when stretched', correct: true },
          {
            text: 'The material becomes unstable',
            feedback: 'Stability needs positive bulk and shear moduli, and both stay positive just below zero. The limit is further away; the next step finds it.',
          },
          { text: 'Nothing: ν cannot go below zero', feedback: 'Positive ν is common, not required. Nothing about ν = 0 is special to stability.' },
        ],
      },
      controls: [{ kind: 'param', key: 'nu12' }],
      task: {
        goal: 'Make ν clearly negative (below −0.3) and watch the outline.',
        check: (s) => s.params.nu12 < -0.3,
        solve: (s) => withParam(s, 'nu12', -0.5),
      },
      explain: [
        'A negative Poisson ratio means the material widens when stretched and narrows when compressed. Such materials are called **auxetic**. Re-entrant foams reach ν ≈ −0.7 (Lakes, 1987); auxetic lattices and some honeycombs do the same by unfolding their cells.',
      ],
    },
    {
      title: 'How far can ν go?',
      body: [
        'The light band on the slider is the range that keeps the material stable. Drag ν to both ends of the band and watch the stiffness matrix $\\bar{\\mathbf C}$.',
      ],
      show: ['matrices', 'response'],
      controls: [{ kind: 'param', key: 'nu12' }],
      predict: {
        question: "For an isotropic solid, which values of Poisson's ratio are physically allowed?",
        options: [
          { text: '0 < ν < ½', feedback: 'You just made ν negative and nothing broke.' },
          { text: '−1 < ν < ½', correct: true },
          { text: '−1 < ν < 1', feedback: 'That is the limit for a 2D sheet considered on its own. The real solid also has a thickness direction.' },
          { text: 'Any value', feedback: 'The band on the slider says otherwise.' },
        ],
      },
      explain: [
        'Stability needs positive bulk and shear moduli: $K = E/3(1-2\\nu) > 0$ and $G = E/2(1+\\nu) > 0$, so $-1 < \\nu < \\tfrac12$.',
        'Near ½ the material becomes incompressible; near −1 it becomes infinitely stiff in shear (with E held fixed). A 2D sheet considered alone would allow ν up to 1: the limit of ½ comes from the thickness direction.',
      ],
    },
    {
      title: 'A metal that gets wider',
      body: [
        'Copper is an ordinary metal: along its cube axes ν = 0.42. A single crystal, though, is anisotropic, so its Poisson ratio depends on the direction you pull and the direction you measure.',
        'The teal arrows are the crystal axes. Once you answer, θ unlocks; you can also drag the teal handle on the ring.',
      ],
      // The in-plane widening is only 14 % of the stretch, so magnify enough to see it.
      setup: (s) => fresh('cubic-cu', s, { overlays: { materialAxes: true }, magnification: 800 }),
      show: ['response'],
      predict: {
        question: 'Pull the crystal along a face diagonal ⟨110⟩. What happens to its width along the other face diagonal?',
        options: [
          {
            text: 'It contracts, as along the cube axis',
            feedback: 'That is what an isotropic solid would do. Copper is strongly anisotropic (Zener ratio ≈ 3.2), so the lateral response depends on the pair of directions, not just on the material.',
          },
          {
            text: 'It contracts much more',
            feedback: 'Something does contract much more, but it is the thickness, not the in-plane width. Watch both εyy and εzz.',
          },
          { text: 'It gets wider', correct: true },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Rotate the crystal by 45° so that x runs along ⟨110⟩, and look at εyy.',
        check: (s, d) => Math.abs((((s.thetaDeg % 90) + 90) % 90) - 45) < 1 && d.response.strain[1] > 0,
        solve: (s) => ({ ...s, thetaDeg: 45 }),
      },
      explain: [
        'Along ⟨110⟩ copper is auxetic in the plane: $\\nu_{xy} \\approx -0.14$, while its thickness contracts strongly ($\\nu_{xz} \\approx 0.82$). Most cubic metals have such a direction (Baughman et al., Nature 1998).',
        'The isotropic bounds −1 < ν < ½ do not apply to anisotropic materials: their directional Poisson ratios can fall well outside them.',
      ],
    },
    {
      title: 'Hold the thickness',
      body: [
        'So far the sheet has been free to change thickness (plane stress). Now hold εzz = 0, as in a long body constrained along z (plane strain).',
      ],
      show: ['response'],
      controls: [{ kind: 'mode' }],
      predict: {
        question: 'With the thickness held, will the copper still get wider along y?',
        options: [
          {
            text: 'Yes, nothing in the plane changed',
            feedback: 'The in-plane constants did not change, but the constraint did: holding the thickness takes a reaction σzz, and that acts back on the in-plane strains.',
          },
          { text: 'No, it contracts', correct: true },
        ],
      },
      task: {
        goal: 'Switch to plane strain and look at εyy again.',
        check: (s, d) => s.mode === 'strain' && d.response.strain[1] < 0,
        solve: (s) => ({ ...s, mode: 'strain' }),
      },
      explain: [
        'Free, the sheet would thin strongly ($\\nu_{xz} \\approx 0.82$). Holding εzz = 0 therefore takes a tensile reaction $\\sigma_{zz} \\approx 0.42\\,\\sigma_{xx}$, and that σzz contracts the sheet along y through the ordinary Poisson coupling between [001] and ⟨110⟩. This outweighs the in-plane auxetic tendency.',
        'Whether a material looks auxetic depends on what else is constrained: the same crystal, pulled the same way, contracts here.',
      ],
    },
  ],
};
