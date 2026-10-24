import { tractionOnCut } from '../mechanics';
import { type LabState, deriveLab } from '../app/lab';
import { fmt } from '../app/format';
import type { Guide } from './types';
import { fresh, unloaded, withExperiment, withParam } from './helpers';

const ISO_E = 200_000;
const ISO_NU = 0.3;
const ISO_G = ISO_E / (2 * (1 + ISO_NU));

/** G that would make a cubic material with these E and ν isotropic. */
const gIso = (s: LabState) => s.params.E1 / (2 * (1 + s.params.nu12));
const isoLikeCubic = (s: LabState) =>
  fresh('cub-3a', s, { params: { E1: ISO_E, nu12: ISO_NU, G12: ISO_G }, overlays: { materialAxes: true, materialLines: true }, magnification: 300 });

export const twoConstants: Guide = {
  id: 'two-constants',
  track: 'Level 1',
  title: 'Why do two constants describe an isotropic solid?',
  summary: 'Pure shear is tension and compression at 45°, so G follows from E and ν. Free G from that tie and the material becomes cubic.',
  steps: [
    {
      title: 'Cut a sheared sheet',
      context: [
        'A sheet of an isotropic solid (E = 200 GPa, ν = 0.30), about to be loaded in pure shear: shear tractions τxy on all four faces and no normal tractions. The magenta line is a cut through the sheet, and the magenta arrows will show the traction acting on it.',
      ],
      setup: (s) => unloaded(fresh('iso-2a', s, { overlays: { cut: true }, cutDeg: 0, magnification: 300 })),
      show: ['principal'],
      predict: {
        question: 'Is there a plane through the sheet that carries only a normal traction, with no shear at all?',
        options: [
          { text: 'No: the load is pure shear, so every plane carries shear', feedback: 'The faces carry pure shear, but the traction depends on the plane you cut. Turn the cut.' },
          { text: 'Yes, planes at 45° to the faces', correct: true },
          { text: 'Only the y faces', feedback: 'The y faces carry shear too: τxy acts on all four faces.' },
        ],
        reveal: (s) => withExperiment(s, 'shear'),
      },
      try: {
        instructions: ['Turn the cut with the slider, or drag the magenta handle on the ring, and watch the arrows on the cut and its point on Mohr’s circle.'],
        controls: [{ kind: 'cut' }],
        task: {
          goal: 'Find a cut whose traction has no shear component at all.',
          check: (s, d) => {
            const t = tractionOnCut(d.response.stress, (s.cutDeg * Math.PI) / 180);
            return Math.abs(t.shear) < 1e-3 * s.scales.stress && Math.abs(t.normal) > 0.5 * s.scales.stress;
          },
          solve: (s) => ({ ...s, cutDeg: 45 }),
        },
      },
      observe: {
        question: 'How large is the normal traction on the plane you found?',
        options: [
          { text: 'Equal in size to τ: tension or compression, depending on the diagonal', correct: true },
          { text: 'Zero: no shear means no traction at all', feedback: 'The arrows on the cut are not zero. Read σn under Mohr’s circle.' },
          { text: 'Twice τ', feedback: 'Read σn under Mohr’s circle: it equals the applied τ.' },
        ],
      },
      explain: [
        'There are two such planes. With the normal at 45° (or −135°, the same plane seen from the other side) the traction is pure tension, $\\sigma_n = \\tau$. At 135° (or −45°) it is pure compression, $\\sigma_n = -\\tau$.',
        'Pure shear is tension and compression along the diagonals. On Mohr’s circle that is a circle centred on the origin, with radius τ.',
      ],
    },
    {
      title: 'So the shear stiffness is not free',
      context: [
        'The cut showed that this single stress state has two descriptions: shear on the x and y faces, or tension τ along one diagonal plus compression τ along the other. Nothing about the load has changed.',
      ],
      show: ['matrices', 'response'],
      predict: {
        question: 'The sheet is an isotropic material. Knowing only its E and ν, can you predict how much it shears?',
        options: [
          { text: 'Yes: G follows from E and ν', correct: true },
          { text: 'No: G is a separate property that must be measured', feedback: 'For many materials it is. For an isotropic one it is fixed by E and ν, as the 45° picture shows.' },
        ],
      },
      explain: [
        'Along the tension diagonal the strain is $\\varepsilon_1 = (\\tau + \\nu\\tau)/E$: its own tension plus the Poisson effect of the compression. The shear strain is $\\gamma_{xy} = 2\\varepsilon_1$, so',
        '$G = \\dfrac{\\tau}{\\gamma_{xy}} = \\dfrac{E}{2(1+\\nu)}$',
        'which is 76.9 GPa here ($G_{xy}$ in the strip under the matrices). This is not a definition of G. It holds because an isotropic material must respond to the 45° description exactly as it would to the same loading along x.',
      ],
    },
    {
      title: 'Let G go free',
      context: [
        'This material has the same E and ν along the x, y and z axes, but its shear modulus G is an independent constant. It starts at the isotropic value, so E(φ) is still a circle.',
      ],
      setup: isoLikeCubic,
      show: ['directional', 'response'],
      predict: {
        question: 'If G rises but E stays the same along x, y and z, is the material still isotropic?',
        options: [
          { text: 'Yes: E₁ = E₂ = E₃, so nothing depends on direction', feedback: 'Equal moduli along the axes are not enough. Look at E between the axes.' },
          { text: 'No: E now depends on direction between the axes', correct: true },
        ],
      },
      try: {
        instructions: ['Raise G well above its isotropic value (the snap point) and watch the polar plot of E(φ).'],
        controls: [{ kind: 'param', key: 'G12' }],
        task: {
          goal: 'Raise G to at least 1.3 times its isotropic value.',
          check: (s) => s.params.G12 > 1.3 * gIso(s),
          solve: (s) => withParam(s, 'G12', 1.8 * gIso(s)),
        },
      },
      observe: {
        question: 'Where are the lobes of E(φ) now?',
        options: [
          { text: 'On the diagonals, at 45° to the axes', correct: true },
          { text: 'On the axes', feedback: 'Along the axes E is still 200 GPa; look between them.' },
          { text: 'There are no lobes: E(φ) is still a circle', feedback: 'Check that G is above the snap point marked “isotropic”.' },
        ],
      },
      explain: [
        'The circle has become a four-lobed rosette with its lobes on the diagonals: this is **cubic** symmetry, with three independent constants E, ν and G. Anisotropy does not require $E_1 \\neq E_2$; it can sit entirely between the axes.',
        'A pull along a diagonal is partly a shear of the cube axes, so its stiffness rises with G: here the diagonals are the stiffest directions.',
      ],
    },
    {
      title: 'A real cubic crystal',
      context: [
        'A cubic crystal seen on its cube face (the crossed lines are its cube axes). Its Zener ratio is 3, so it is like the material you just made with a raised G. The traction σxx stays the same throughout; only the crystal turns.',
      ],
      setup: (s) => fresh('cub-3a', s, { overlays: { materialAxes: true, materialLines: true } }),
      show: ['directional', 'response'],
      predict: {
        question: 'Along which direction of its cube face will this crystal be stiffest?',
        options: [
          { text: 'Along a cube edge ⟨100⟩', feedback: 'That would need A < 1. This crystal’s A is 3.' },
          { text: 'Along a face diagonal ⟨110⟩, at 45°', correct: true },
          { text: 'Equally stiff in every direction', feedback: 'That would need A = 1.' },
        ],
      },
      try: {
        instructions: ['Rotate the crystal so that x runs along a face diagonal, and compare the stretch εxx with its value at θ = 0 (both shown with the slider).'],
        controls: [{ kind: 'theta' }],
        readouts: (s, d) => [
          ['\\varepsilon_{xx}\\ \\text{now}', `${fmt(d.response.strain[0] * 1e3, 4)} ×10⁻³`],
          ['\\varepsilon_{xx}\\ (\\theta = 0)', `${fmt(deriveLab({ ...s, thetaDeg: 0 }).response.strain[0] * 1e3, 4)} ×10⁻³`],
          ['E_x', `${fmt(d.plane.Ex / 1000, 4)} GPa`],
        ],
        task: {
          goal: 'Rotate the crystal so that x runs along a face diagonal.',
          check: (s) => Math.abs((((s.thetaDeg % 90) + 90) % 90) - 45) < 1,
          solve: (s) => ({ ...s, thetaDeg: 45 }),
        },
      },
      observe: {
        question: 'Under the same traction, how does the stretch along ⟨110⟩ compare with the stretch along ⟨100⟩?',
        options: [
          { text: 'About half as large', correct: true },
          { text: 'About the same', feedback: 'Compare the two εxx readouts.' },
          { text: 'About twice as large', feedback: 'A stiffer direction stretches less under the same traction: compare the two εxx readouts.' },
        ],
      },
      explain: [
        'E⟨100⟩ = 70.7 GPa and E⟨110⟩ = 134 GPa. Out of this plane, along the body diagonal, E⟨111⟩ = 190 GPa.',
        'Isotropy demands that no rotation changes anything, and that ties G to E and ν: two constants. Cubic symmetry demands only invariance under 90° rotations about the cube axes, which leaves G free: three constants.',
      ],
    },
    {
      title: 'Now the other way',
      context: ['Back to the cubic material with isotropic-like E and ν, with G again at its isotropic value.'],
      setup: isoLikeCubic,
      show: ['directional', 'response'],
      predict: {
        question: 'If G is lowered below its isotropic value instead, where will E be largest?',
        options: [
          {
            text: 'Still along the diagonals',
            feedback: 'The diagonals were stiff because G was high. Their stiffness follows G, so with G low they soften.',
          },
          { text: 'Along the cube axes, with the diagonals now the softest directions', correct: true },
        ],
      },
      try: {
        instructions: ['Lower G well below its isotropic value and watch where the lobes go.'],
        controls: [{ kind: 'param', key: 'G12' }],
        task: {
          goal: 'Lower G to at most 0.75 times its isotropic value.',
          check: (s) => s.params.G12 < 0.75 * gIso(s),
          solve: (s) => withParam(s, 'G12', 0.6 * gIso(s)),
        },
      },
      explain: [
        'The lobes swing to the axes: E is now largest along the cube edges and smallest along the diagonals. Both shapes are cubic. The Zener ratio $A = G/G^{\\mathrm{iso}}$, with $G^{\\mathrm{iso}} = E/2(1+\\nu)$, says which: A > 1 puts the lobes on the diagonals, A < 1 on the axes.',
        'Most cubic metal crystals have A > 1, often 2 or more, like the crystal you just rotated (A = 3). A few have A < 1, and a few are almost isotropic, with A close to 1.',
      ],
    },
    {
      title: 'An isotropic version of the crystal',
      context: [
        'A thought experiment: keep the crystal’s E⟨100⟩ = 70.7 GPa and G = 75 GPa, and change only ν until the rosette becomes a circle.',
      ],
      setup: (s) => fresh('cub-3a', s, { overlays: { materialAxes: true, materialLines: true } }),
      show: ['directional'],
      predict: {
        question: 'Which ν would make this material isotropic?',
        options: [
          { text: 'ν ≈ +0.41', feedback: 'That is the crystal’s own ν, which gives the rosette you just saw.' },
          { text: 'ν ≈ +0.13', feedback: 'Isotropy needs G = E/2(1+ν), so ν = E/2G − 1. Put in E = 70.7 GPa and G = 75 GPa.' },
          { text: 'ν ≈ −0.53', correct: true },
          { text: 'No admissible value', feedback: 'The value needed lies inside −1 < ν < ½, so it is admissible.' },
        ],
      },
      try: {
        instructions: ['Drag ν to its snap point marked “isotropic” and check that E(φ) becomes a circle.'],
        controls: [{ kind: 'param', key: 'nu12' }],
        task: {
          goal: 'Set ν to its isotropic value.',
          check: (s, d) => s.params.nu12 < 0 && d.planeExt.Emax / d.planeExt.Emin < 1 + 1e-6,
          solve: (s) => withParam(s, 'nu12', s.params.E1 / (2 * s.params.G12) - 1),
        },
      },
      explain: [
        '$\\nu = E/2G - 1 \\approx -0.53$: an isotropic material with this crystal’s E and G would be auxetic. The cubic anisotropy is a single number, so it can be removed through G or through ν. That is also why $\\nu/\\nu^{\\mathrm{iso}}$ is not a second, independent anisotropy index: it measures the same deviation as the Zener ratio.',
      ],
    },
  ],
};
