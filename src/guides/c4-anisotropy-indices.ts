import { PRESETS } from '../mechanics';
import type { LabState } from '../app/lab';
import type { Guide } from './types';
import { fresh, withParam } from './helpers';

const axes = { overlays: { materialAxes: true, materialLines: true } };
const CUBIC = PRESETS.find((p) => p.id === 'cub-3a')!.params;
/** The cubic preset's Zener ratio, A = G/G_iso with G_iso = E/2(1+ν). */
export const CUBIC_A = CUBIC.G12 / (CUBIC.E1 / (2 * (1 + CUBIC.nu12)));
/** The G that gives a cubic material with these E and ν the Zener ratio 1/A of the preset. */
export const gInverseA = (s: LabState) => s.params.E1 / (2 * (1 + s.params.nu12)) / CUBIC_A;

export const anisotropyIndices: Guide = {
  id: 'anisotropy-indices',
  track: 'Level 3',
  title: 'How anisotropic is it, really?',
  summary: 'In-plane ratios, the Zener ratio and the universal index Aᵁ answer different questions: a cubic crystal on two sections, the same crystal with A and 1/A, and two crystals ranked two ways.',
  steps: [
    {
      title: 'One crystal, two sections',
      context: [
        'A cubic crystal on its cube face (001). The table under the polar plot lists several measures of anisotropy: the in-plane $E_{\\max}/E_{\\min}$ (1.89 here), the Zener ratio A (3.00), the 3D $E_{\\max}/E_{\\min}$ (2.69) and the universal index $A^U$ (1.60), which is zero only for isotropy.',
      ],
      setup: (s) => fresh('cub-3a', s, axes),
      show: ['directional'],
      predict: {
        question: 'If the specimen were cut perpendicular to a body diagonal [111] instead, what would the in-plane E_max/E_min be?',
        options: [
          { text: 'Larger: [111] is the crystal’s stiffest direction', feedback: '[111] is the normal of the new section, so it does not lie in the plane at all.' },
          { text: 'Exactly 1: E(φ) would be a circle', correct: true },
          { text: 'Still 1.89: the material has not changed', feedback: 'The material has not changed, but an in-plane ratio describes the section, and this is a different one.' },
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
        'On (111) the crystal is isotropic in the plane, with E = 133.7 GPa in every in-plane direction: the plane is perpendicular to a 3-fold axis, and in two dimensions a 3-fold symmetry already forces an elasticity tensor to be isotropic. The material is as anisotropic as before. $A^U$ and the 3D ratio describe the whole tensor and do not depend on how it is cut; in-plane ratios describe a section.',
      ],
    },
    {
      title: 'A and 1/A',
      context: [
        'Back on the crystal’s cube face, with $A = G/G^{\\mathrm{iso}} = 3$ and $G^{\\mathrm{iso}} = E/2(1+\\nu) = 25$ GPa: E is largest along the face diagonals. Lowering G to $G^{\\mathrm{iso}}/3 = 8.3$ GPa, with E and ν unchanged, would give A = 1/3 and put the lobes on the cube axes instead.',
      ],
      setup: (s) => {
        const t = fresh('cub-3a', s, axes);
        // The usual slider range stops at a tenth of the preset's G; this step needs a little lower.
        return { ...t, tracks: { ...t.tracks, G12: { min: 3_000, max: 300_000, log: true } } };
      },
      show: ['directional'],
      predict: {
        question: 'By Aᵁ, would that crystal be more anisotropic than the original one, less, or equally?',
        options: [
          { text: 'More', feedback: 'Aᵁ measures how far the crystal is from isotropy, A = 1, not on which side.' },
          { text: 'Less', feedback: 'Aᵁ measures how far the crystal is from isotropy, A = 1, not on which side.' },
          { text: 'Equally', correct: true },
        ],
      },
      try: {
        instructions: ['Lower G to its snap point “A = 1/3” and compare the table with the original values: Aᵁ 1.60, 3D E_max/E_min 2.69, in-plane 1.89.'],
        controls: [{ kind: 'param', key: 'G12' }],
        extraSnaps: (s) => ({ G12: [{ value: gInverseA(s), label: 'A = 1/3' }] }),
        task: {
          goal: 'Set G so that A = 1/3.',
          check: (s) => Math.abs(s.params.G12 - gInverseA(s)) < 1e-3 * gInverseA(s),
          solve: (s) => withParam(s, 'G12', gInverseA(s)),
        },
      },
      observe: {
        question: 'Did the two E_max/E_min ratios stay the same as well?',
        options: [
          { text: 'Yes, both stayed the same', feedback: 'Compare them with the original 2.69 (3D) and 1.89 (in plane).' },
          { text: 'No, both rose', correct: true },
          { text: 'No, both fell', feedback: 'Compare them with the original 2.69 (3D) and 1.89 (in plane).' },
        ],
      },
      explain: [
        'For a cubic crystal $A^U = \\tfrac65\\,(\\sqrt A - 1/\\sqrt A)^2$, which treats A and 1/A alike. The Young’s-modulus ratios do not: here they rose to 2.89 (3D) and 2.41 (in plane). Different indices weigh different departures from isotropy, so they need not rank two materials the same way.',
      ],
    },
    {
      title: 'Two crystals',
      context: [
        'A hexagonal crystal, seen in a section containing its symmetry axis, and a trigonal crystal, seen in the plane perpendicular to its 3-fold axis.',
      ],
      setup: (s) => fresh('hex-5a', s, axes),
      show: ['directional'],
      try: {
        instructions: ['Switch between the two materials and compare their tables.'],
        controls: [{ kind: 'preset', ids: ['hex-5a', 'trg-6a'] }],
        task: {
          goal: 'Look at the trigonal crystal too.',
          check: (s) => s.presetId === 'trg-6a',
          solve: (s) => fresh('trg-6a', s, axes),
        },
      },
      observe: {
        question: 'Which of the two is more anisotropic?',
        options: [
          {
            text: 'The hexagonal one: its section has E_max/E_min = 1.37, the trigonal one’s 1.00',
            feedback: 'That compares two sections, not two materials. The trigonal crystal’s section is perpendicular to a 3-fold axis, so it is isotropic in that plane however anisotropic the crystal is.',
          },
          { text: 'The trigonal one: Aᵁ = 0.83 against 0.15', correct: true },
          { text: 'They cannot be ranked', feedback: 'No single number tells the whole story, but Aᵁ does rank the full tensors.' },
        ],
      },
      explain: [
        'By the full tensor the trigonal crystal is more than five times further from isotropy than the hexagonal one ($A^U$ = 0.83 against 0.15; 3D $E_{\\max}/E_{\\min}$ = 1.87 against 1.37), although its section looks perfectly isotropic.',
        '$A^U = 5\\,G_V/G_R + K_V/K_R - 6$ compares the Voigt (uniform strain) and Reuss (uniform stress) averages of the bulk and shear moduli. It is zero only when they coincide, which happens only for isotropy (Ranganathan & Ostoja-Starzewski, 2008). In-plane ratios describe the section you test, the Zener ratio only cubic crystals, and $A^U$ any material, though always as a single number.',
      ],
    },
  ],
};
