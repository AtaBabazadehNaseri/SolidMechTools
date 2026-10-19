import { deriveLab, type LabState } from '../app/lab';
import type { Guide } from './types';
import { fresh } from './helpers';

const axes = { overlays: { materialAxes: true } };

/** |γyz| relative to the total out-of-plane shear produced by the current pull. */
function gyzShare(s: LabState): number {
  const [, gyz, gxz] = deriveLab(s).out.strain;
  return Math.abs(gyz) / Math.max(Math.hypot(gyz, gxz), 1e-300);
}

export const looksIsotropic: Guide = {
  id: 'looks-isotropic',
  track: 'Level 2',
  title: 'Can an anisotropic crystal look isotropic?',
  summary: 'Copper on its (111) plane and quartz on its basal plane: isotropic by every in-plane measure, yet stretching them shears them out of the plane.',
  steps: [
    {
      title: 'Copper on its cube face',
      body: [
        'A copper single crystal, cut on its cube face (001). Its E(φ) is a four-lobed rosette: 67 GPa along the cube edges and 130 GPa along the face diagonals. Copper is one of the more anisotropic metals (Zener ratio ≈ 3.2).',
      ],
      setup: (s) => fresh('cubic-cu', s, axes),
      show: ['directional'],
    },
    {
      title: 'Cut it on another plane',
      body: ['The crystal stays the same; only the plane of the specimen changes.'],
      show: ['directional'],
      predict: {
        question: 'Take a section perpendicular to the body diagonal [111]. What will E(φ) look like in that plane?',
        options: [
          { text: 'Another four-lobed rosette', feedback: 'The (111) plane has a 3-fold axis normal to it, not a 4-fold one.' },
          { text: 'A six-lobed flower', feedback: 'A 3-fold axis might suggest six lobes, but the in-plane part of an elasticity tensor contains only 2θ and 4θ harmonics.' },
          { text: 'A perfect circle', correct: true },
        ],
      },
      controls: [{ kind: 'section' }],
      task: {
        goal: 'Switch the section to the plane ⟂ [111].',
        check: (s) => s.section === 'n111',
        solve: (s) => ({ ...s, section: 'n111' }),
      },
      explain: [
        'A circle: in the (111) plane copper is isotropic, with E = 130 GPa in every direction. In 2D the anisotropic part of the elasticity tensor varies only as cos 2θ and cos 4θ, and a 3-fold axis normal to the plane allows neither.',
      ],
    },
    {
      title: 'Turn it',
      body: ['Watch the 2D matrices while the crystal turns in this plane.'],
      show: ['matrices'],
      predict: {
        question: 'Will any entry of C̄ or S̄ change as you rotate the crystal in this plane?',
        options: [
          { text: 'No', correct: true },
          { text: 'Yes, as on the cube face', feedback: 'On the cube face the plane has a 4-fold axis; this one is isotropic in plane.' },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Rotate the crystal by at least 20° in either direction.',
        check: (s) => s.section === 'n111' && Math.abs(s.thetaDeg) >= 20,
        solve: (s) => ({ ...s, section: 'n111', thetaDeg: 40 }),
      },
      explain: [
        'Nothing moves, and $\\bar S_{66} = 2(\\bar S_{11} - \\bar S_{12})$, the isotropy relation in 2D. By every in-plane measure this section of a strongly anisotropic crystal is isotropic.',
      ],
    },
    {
      title: 'What the plane does not show',
      body: ['Pull along x and look at the out-of-plane rows of the Response table.'],
      show: ['response'],
      predict: {
        question: 'Is the response identical to that of an isotropic sheet?',
        options: [
          { text: 'Yes: every in-plane quantity is isotropic', feedback: 'Every in-plane quantity is. Check the out-of-plane rows.' },
          { text: 'No: the sheet also shears out of its plane', correct: true },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Rotate the crystal to find an angle at which γyz vanishes. γxz takes over there.',
        check: (s) => s.section === 'n111' && gyzShare(s) < 0.05,
        solve: (s) => {
          let best = { ...s, section: 'n111' as const };
          for (let t = -60; t <= 60; t++) {
            const cand = { ...s, section: 'n111' as const, thetaDeg: t };
            if (gyzShare(cand) < gyzShare(best)) best = cand;
          }
          return best;
        },
      },
      explain: [
        'In-plane tension makes this crystal shear out of its plane (γyz and γxz) with a three-fold pattern: rotating by 120° repeats it. A 2D view of the plane alone can never show this.',
        'In plane stress these shears are free and do not affect the in-plane answer. In plane strain they are held at zero, and that needs reaction shear stresses.',
      ],
    },
    {
      title: 'Quartz, and plane strain',
      body: [
        'α-quartz has a 3-fold axis normal to its basal plane, which is the section shown. It too is isotropic in plane and shears out of plane under in-plane tension.',
      ],
      setup: (s) => fresh('trig-quartz', s, axes),
      show: ['directional', 'response'],
      predict: {
        question: 'Switch to plane strain. Which reactions appear besides σzz?',
        options: [
          { text: 'None', feedback: 'Plane strain also holds the out-of-plane shears at zero.' },
          { text: 'Out-of-plane shear stresses τyz and τxz', correct: true },
          { text: 'An in-plane shear stress τxy', feedback: 'In plane the section is isotropic, so a pull along x alone produces no τxy.' },
        ],
      },
      controls: [{ kind: 'mode' }],
      task: {
        goal: 'Switch to plane strain and look at the τyz and τxz rows.',
        check: (s, d) => s.mode === 'strain' && Math.hypot(d.out.stress[1], d.out.stress[2]) > 1e-3 * s.scales.stress,
        solve: (s) => ({ ...s, mode: 'strain' }),
      },
      explain: [
        'Plane strain holds γyz = γxz = 0, so the three-fold coupling now appears as reaction shear stresses τyz and τxz. A plane-strain model of such a crystal carries those stresses implicitly. That is right if the real body is restrained that way; if it is not, a generalized plane-strain or 3D model is needed.',
      ],
    },
  ],
};
