import { tractionOnCut } from '../mechanics';
import type { Guide } from './types';
import { fresh, unloaded, withExperiment, withParam } from './helpers';

const STEEL_E = 200_000;
const STEEL_NU = 0.3;
const STEEL_G = STEEL_E / (2 * (1 + STEEL_NU));

export const twoConstants: Guide = {
  id: 'two-constants',
  track: 'Level 1',
  title: 'Why do two constants describe an isotropic solid?',
  summary: 'Pure shear is tension and compression at 45°, so G follows from E and ν. Free G from that tie and the material becomes cubic.',
  steps: [
    {
      title: 'Cut a sheared sheet',
      body: [
        'A steel sheet, about to be loaded in pure shear: shear tractions τxy on all four faces and no normal tractions. The magenta line is a cut through the sheet, and the magenta arrows will show the traction acting on it.',
      ],
      setup: (s) => unloaded(fresh('iso-steel', s, { overlays: { cut: true }, cutDeg: 0, magnification: 300 })),
      show: ['principal'],
      predict: {
        question: 'Is there a plane through the sheet that carries only a normal traction, with no shear at all?',
        options: [
          { text: 'No: the load is pure shear, so every plane carries shear', feedback: 'The faces carry pure shear, but the traction depends on the plane you cut. Turn the cut.' },
          { text: 'Yes, a plane at 45° to the faces', correct: true },
          { text: 'Only the y faces', feedback: 'The y faces carry shear too: τxy acts on all four faces.' },
        ],
        reveal: (s) => withExperiment(s, 'shear'),
      },
      controls: [{ kind: 'cut' }],
      task: {
        goal: 'Turn the cut until its traction is pure tension: no shear component, positive normal component.',
        check: (s, d) => {
          const t = tractionOnCut(d.response.stress, (s.cutDeg * Math.PI) / 180);
          return Math.abs(t.shear) < 1e-3 * s.scales.stress && t.normal > 0;
        },
        solve: (s) => ({ ...s, cutDeg: 45 }),
      },
      explain: [
        'At 45° the traction is pure tension, $\\sigma_n = \\tau$; at 135° it is pure compression, $\\sigma_n = -\\tau$. Pure shear is tension and compression along the diagonals. On Mohr’s circle this is a circle centred on the origin, with radius τ.',
      ],
    },
    {
      title: 'So the shear stiffness is not free',
      body: ['The sheet now carries tension τ along one diagonal and compression τ along the other.'],
      show: ['matrices', 'response'],
      predict: {
        question: 'Knowing only E and ν, can you predict how much the sheet shears?',
        options: [
          { text: 'Yes: G follows from E and ν', correct: true },
          { text: 'No: G is a separate property that must be measured', feedback: 'For many materials it is. For an isotropic one it is fixed by E and ν, as the 45° picture shows.' },
        ],
      },
      explain: [
        'Along the tension diagonal the strain is $\\varepsilon_1 = (\\tau + \\nu\\tau)/E$: its own tension plus the Poisson effect of the compression. The shear strain is $\\gamma_{xy} = 2\\varepsilon_1$, so',
        '$G = \\dfrac{\\tau}{\\gamma_{xy}} = \\dfrac{E}{2(1+\\nu)}$',
        'which is 76.9 GPa for steel ($G_{xy}$ in the strip under the matrices). This is not a definition of G. It holds because an isotropic material must respond to the 45° loading exactly as it would to the same loading along x.',
      ],
    },
    {
      title: 'Let G go free',
      body: [
        'This material has steel’s E and ν along the x, y and z axes, but its shear modulus G is now an independent knob. It starts at the isotropic value.',
      ],
      setup: (s) => fresh('cubic-cu', s, { params: { E1: STEEL_E, nu12: STEEL_NU, G12: STEEL_G }, overlays: { materialAxes: true }, magnification: 300 }),
      show: ['directional', 'response'],
      predict: {
        question: 'If G changes but E stays the same along x, y and z, is the material still isotropic?',
        options: [
          { text: 'Yes: E₁ = E₂ = E₃, so nothing depends on direction', feedback: 'Equal moduli along the axes are not enough. Look at E between the axes.' },
          { text: 'No: E now depends on direction between the axes', correct: true },
        ],
      },
      controls: [{ kind: 'param', key: 'G12' }],
      task: {
        goal: 'Move G away from its isotropic value (the snap point) and watch the polar plot of E(φ).',
        check: (_s, d) => d.planeExt.Emax / d.planeExt.Emin > 1.05,
        solve: (s) => withParam(s, 'G12', 1.8 * STEEL_G),
      },
      explain: [
        'The circle becomes a four-lobed rosette: this is **cubic** symmetry, with three independent constants E, ν and G. Anisotropy does not require $E_1 \\neq E_2$; it can sit entirely between the axes.',
        'The ratio $A = G/G^{\\mathrm{iso}}$ with $G^{\\mathrm{iso}} = E/2(1+\\nu)$, the Zener ratio, measures it. With A > 1 the diagonals are stiffer than the axes; with A < 1 they are softer.',
      ],
    },
    {
      title: 'A real cubic crystal',
      body: ['Copper, a single crystal seen on its cube face. Its Zener ratio is about 3.2.'],
      setup: (s) => fresh('cubic-cu', s, { overlays: { materialAxes: true } }),
      show: ['directional', 'response'],
      predict: {
        question: 'Along which direction of its cube face is copper stiffest?',
        options: [
          { text: 'Along a cube edge ⟨100⟩', feedback: 'With A > 1 the diagonals are stiffer than the edges.' },
          { text: 'Along a face diagonal ⟨110⟩, at 45°', correct: true },
          { text: 'Equally stiff in every direction', feedback: 'That would need A = 1.' },
        ],
      },
      controls: [{ kind: 'theta' }],
      task: {
        goal: 'Rotate the crystal so that x runs along a face diagonal, and compare Eₓ with its value at θ = 0.',
        check: (s) => Math.abs((((s.thetaDeg % 90) + 90) % 90) - 45) < 1,
        solve: (s) => ({ ...s, thetaDeg: 45 }),
      },
      explain: [
        'E⟨100⟩ = 66.7 GPa and E⟨110⟩ = 130 GPa; out of this plane, along the body diagonal, E⟨111⟩ = 191 GPa.',
        'Isotropy demands that no rotation changes anything, and that ties G to E and ν: two constants. Cubic symmetry demands only invariance under 90° rotations about the cube axes, which leaves G free: three constants.',
      ],
    },
    {
      title: 'Make copper isotropic, the other way',
      body: ['Keep copper’s E and G and change only ν until the rosette becomes a circle. ν is unlocked once you answer, and it has a snap point marked “isotropic”.'],
      show: ['directional'],
      predict: {
        question: 'What value of ν would make copper isotropic with its E and G?',
        options: [
          { text: 'About 0.3, like most metals', feedback: 'It must satisfy G = E/2(1+ν) with copper’s E⟨100⟩ = 66.7 GPa and G = 75.4 GPa.' },
          { text: 'A negative value', correct: true },
          { text: 'No admissible value works', feedback: 'One constant is enough to remove the single degree of cubic anisotropy, provided the result is admissible. Try it.' },
        ],
      },
      controls: [{ kind: 'param', key: 'nu12' }],
      task: {
        goal: 'Snap ν to its isotropic value and check that E(φ) is a circle.',
        check: (s, d) => s.params.nu12 < 0 && d.planeExt.Emax / d.planeExt.Emin < 1 + 1e-6,
        solve: (s) => withParam(s, 'nu12', s.params.E1 / (2 * s.params.G12) - 1),
      },
      explain: [
        '$\\nu = E/2G - 1 \\approx -0.56$: an isotropic copper with these E and G would be auxetic. The cubic anisotropy is a single number, so you can remove it through G or through ν. That is also why $\\nu/\\nu^{\\mathrm{iso}}$ is not a second, independent anisotropy index: it measures the same deviation as the Zener ratio.',
      ],
    },
  ],
};
