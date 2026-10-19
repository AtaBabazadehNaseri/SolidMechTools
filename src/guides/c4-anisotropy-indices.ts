import { PRESETS } from '../mechanics';
import type { LabState } from '../app/lab';
import type { Guide } from './types';
import { fresh, withParam } from './helpers';

const axes = { overlays: { materialAxes: true, materialLines: true } };
const COPPER = PRESETS.find((p) => p.id === 'cubic-cu')!.params;
/** Copper's Zener ratio, A = G/G_iso with G_iso = E/2(1+ν). */
export const COPPER_A = COPPER.G12 / (COPPER.E1 / (2 * (1 + COPPER.nu12)));
/** The G that gives a cubic material with these E and ν the Zener ratio 1/A of copper. */
export const gInverseA = (s: LabState) => s.params.E1 / (2 * (1 + s.params.nu12)) / COPPER_A;

export const anisotropyIndices: Guide = {
  id: 'anisotropy-indices',
  track: 'Level 3',
  title: 'How anisotropic is it, really?',
  summary: 'In-plane ratios, the Zener ratio and the universal index Aᵁ answer different questions: copper on two sections, a cubic crystal with A and 1/A, and two minerals ranked two ways.',
  steps: [
    {
      title: 'One crystal, two sections',
      context: [
        'Copper on its cube face (001). The table under the polar plot lists several measures of anisotropy: the in-plane $E_{\\max}/E_{\\min}$ (1.95 here), the Zener ratio A (3.21), the 3D $E_{\\max}/E_{\\min}$ (2.87) and the universal index $A^U$ (1.82), which is zero only for isotropy.',
      ],
      setup: (s) => fresh('cubic-cu', s, axes),
      show: ['directional'],
      predict: {
        question: 'If the specimen were cut perpendicular to a body diagonal [111] instead, what would the in-plane E_max/E_min be?',
        options: [
          { text: 'Larger: [111] is copper’s stiffest direction', feedback: '[111] is the normal of the new section, so it does not lie in the plane at all.' },
          { text: 'Exactly 1: E(φ) would be a circle', correct: true },
          { text: 'Still 1.95: the material has not changed', feedback: 'The material has not changed, but an in-plane ratio describes the section, and this is a different one.' },
        ],
      },
      try: {
        instructions: ['Switch the section to ⟂ [111] and watch the polar plot and the table.'],
        controls: [{ kind: 'section' }],
        task: {
          goal: 'Cut the specimen perpendicular to [111].',
          check: (s) => s.section === 'n111',
          solve: (s) => ({ ...s, section: 'n111' }),
        },
      },
      observe: {
        question: 'What did Aᵁ and the 3D E_max/E_min do?',
        options: [
          { text: 'Nothing: they are unchanged', correct: true },
          { text: 'They dropped to their isotropic values, like the in-plane ratio', feedback: 'Read the last two rows of the table again.' },
          { text: 'They rose', feedback: 'Read the last two rows of the table again.' },
        ],
      },
      explain: [
        'On (111) copper is isotropic in the plane, with E = 130.3 GPa in every in-plane direction: the plane is perpendicular to a 3-fold axis, and in two dimensions a 3-fold symmetry already forces an elasticity tensor to be isotropic. The material is as anisotropic as before. $A^U$ and the 3D ratio describe the whole tensor and do not depend on how it is cut; in-plane ratios describe a section.',
      ],
    },
    {
      title: 'A and 1/A',
      context: [
        'Back on copper’s cube face, with $A = G/G^{\\mathrm{iso}} = 3.21$ and $G^{\\mathrm{iso}} = E/2(1+\\nu) = 23.5$ GPa: E is largest along the face diagonals. Lowering G to $G^{\\mathrm{iso}}/3.21 = 7.3$ GPa, with E and ν unchanged, would give A = 1/3.21 and put the lobes on the cube axes instead.',
      ],
      setup: (s) => {
        const t = fresh('cubic-cu', s, axes);
        // The usual slider range stops at a tenth of copper's G; this step needs a little lower.
        return { ...t, tracks: { ...t.tracks, G12: { min: 3_000, max: 300_000, log: true } } };
      },
      show: ['directional'],
      predict: {
        question: 'By Aᵁ, would that crystal be more anisotropic than copper, less, or equally?',
        options: [
          { text: 'More', feedback: 'Aᵁ measures how far the crystal is from isotropy, A = 1, not on which side.' },
          { text: 'Less', feedback: 'Aᵁ measures how far the crystal is from isotropy, A = 1, not on which side.' },
          { text: 'Equally', correct: true },
        ],
      },
      try: {
        instructions: ['Lower G to its snap point “A = 1/3.21” and compare the table with copper’s values: Aᵁ 1.82, 3D E_max/E_min 2.87, in-plane 1.95.'],
        controls: [{ kind: 'param', key: 'G12' }],
        extraSnaps: (s) => ({ G12: [{ value: gInverseA(s), label: 'A = 1/3.21' }] }),
        task: {
          goal: 'Set G so that A = 1/3.21.',
          check: (s) => Math.abs(s.params.G12 - gInverseA(s)) < 1e-3 * gInverseA(s),
          solve: (s) => withParam(s, 'G12', gInverseA(s)),
        },
      },
      observe: {
        question: 'Did the two E_max/E_min ratios stay the same as well?',
        options: [
          { text: 'Yes, both stayed the same', feedback: 'Compare them with copper’s 2.87 (3D) and 1.95 (in plane).' },
          { text: 'No, both rose', correct: true },
          { text: 'No, both fell', feedback: 'Compare them with copper’s 2.87 (3D) and 1.95 (in plane).' },
        ],
      },
      explain: [
        'For a cubic crystal $A^U = \\tfrac65\\,(\\sqrt A - 1/\\sqrt A)^2$, which treats A and 1/A alike. The Young’s-modulus ratios do not: here they rose to 3.09 (3D) and 2.57 (in plane). Different indices weigh different departures from isotropy, so they need not rank two materials the same way.',
      ],
    },
    {
      title: 'Two minerals',
      context: [
        'α-titanium (hexagonal), seen in a section containing its c axis, and α-quartz (trigonal), seen in its basal plane, perpendicular to its 3-fold axis.',
      ],
      setup: (s) => fresh('hex-ti', s, axes),
      show: ['directional'],
      try: {
        instructions: ['Switch between the two materials and compare their tables.'],
        controls: [{ kind: 'preset', ids: ['hex-ti', 'trig-quartz'] }],
        task: {
          goal: 'Look at quartz too.',
          check: (s) => s.presetId === 'trig-quartz',
          solve: (s) => fresh('trig-quartz', s, axes),
        },
      },
      observe: {
        question: 'Which of the two is more anisotropic?',
        options: [
          {
            text: 'Titanium: its section has E_max/E_min = 1.37, quartz’s 1.00',
            feedback: 'That compares two sections, not two materials. Quartz’s basal plane is perpendicular to a 3-fold axis, so it is isotropic in that plane however anisotropic the crystal is.',
          },
          { text: 'Quartz: Aᵁ = 0.84 against 0.17', correct: true },
          { text: 'They cannot be ranked', feedback: 'No single number tells the whole story, but Aᵁ does rank the full tensors.' },
        ],
      },
      explain: [
        'By the full tensor quartz is about five times further from isotropy than titanium ($A^U$ = 0.84 against 0.17; 3D $E_{\\max}/E_{\\min}$ = 1.88 against 1.37), although its basal section looks perfectly isotropic.',
        '$A^U = 5\\,G_V/G_R + K_V/K_R - 6$ compares the Voigt (uniform strain) and Reuss (uniform stress) averages of the bulk and shear moduli. It is zero only when they coincide, which happens only for isotropy (Ranganathan & Ostoja-Starzewski, 2008). In-plane ratios describe the section you test, the Zener ratio only cubic crystals, and $A^U$ any material, though always as a single number.',
      ],
    },
  ],
};
