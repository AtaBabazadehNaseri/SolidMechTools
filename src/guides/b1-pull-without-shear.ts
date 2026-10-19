import { deriveLab } from '../app/lab';
import type { Guide } from './types';
import { fresh, isAligned, shearPerStretch, unloaded, withExperiment, withParam } from './helpers';

const fibres = { overlays: { materialAxes: true, materialLines: true } };

export const pullWithoutShear: Guide = {
  id: 'pull-without-shear',
  track: 'Level 2',
  title: 'Can pure tension make something shear?',
  summary: 'Pure tension shears an off-axis composite. Where the no-shear directions are, and why they sit at the stationary points of E(φ).',
  steps: [
    {
      title: 'An aligned composite',
      context: [
        'A unidirectional carbon/epoxy ply (T300/5208). The teal lines are the fibres, here along x. Once you answer, the ply is pulled along x with every other traction zero.',
      ],
      setup: (s) => unloaded(fresh('ortho-cfrp', s, fibres)),
      show: ['matrices'],
      predict: {
        question: 'Pulled along its fibres, will the ply shear?',
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
      context: ['The ply stays pulled along x. Its fibres can be turned away from the load.'],
      show: ['matrices', 'response'],
      predict: {
        question: 'If the fibres were turned 30° away from the load, what would happen?',
        options: [
          {
            text: 'Still no shear: the load is still pure tension',
            feedback: 'It is pure tension in the specimen axes, but not in the fibre axes: there it has a shear part, τ₁₂ = −σxx sin θ cos θ.',
          },
          { text: 'It would shear, although no shear traction is applied', correct: true },
          {
            text: 'It could only shear if a shear traction were applied',
            feedback: 'A shear traction is one way to make it shear, not the only one. A material whose axes are not aligned with the load can turn stretch into shear.',
          },
        ],
      },
      try: {
        instructions: ['Rotate the fibres to around 30° (slider, or drag the teal handle) and watch the outline, γxy and the matrices.'],
        controls: [{ kind: 'theta' }],
        task: {
          goal: 'Rotate the fibres to around 30°.',
          check: (_s, d) => Math.abs(shearPerStretch(d.response.strain)) > 0.05,
          solve: (s) => ({ ...s, thetaDeg: 30 }),
        },
      },
      observe: {
        question: 'Which entry of the compliance now produces the shear you see?',
        options: [
          { text: 'S̄₁₆, which was zero with the fibres aligned', correct: true },
          { text: 'S̄₆₆, the shear compliance', feedback: 'S̄₆₆ turns a shear stress into shear strain, and no shear stress is applied. Look at the outlined column of S̄.' },
          {
            text: 'C̄₁₆ in the stiffness',
            feedback: 'In a traction-controlled test the strain is read from S̄, not C̄: γxy = S̄₁₆ σxx. (When C̄₁₆ matters is a Level 3 guide.)',
          },
        ],
      },
      explain: [
        'In the specimen axes $\\bar S_{16} \\neq 0$, so $\\gamma_{xy} = \\bar S_{16}\\,\\sigma_{xx}$. The material did not change, only its representation in the loading frame. In fibre axes, a pull along x is a mixture of $\\sigma_{11}$, $\\sigma_{22}$ and $\\tau_{12}$.',
      ],
    },
    {
      title: 'Where can you pull without shear?',
      context: [
        'The polar plot shows E(φ), the stiffness under uniaxial stress along each direction φ. The dot is the load axis x. The fibres are at about 30° to it.',
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
      try: {
        instructions: ['Rotate the fibres until the pull along x produces no shear.'],
        controls: [{ kind: 'theta' }],
        task: {
          goal: 'Find a fibre angle, other than along the load, at which the pull produces no shear.',
          check: (s, d) => isAligned(s.thetaDeg, 90) && Math.abs(shearPerStretch(d.response.strain)) < 1e-6,
          solve: (s) => ({ ...s, thetaDeg: 90 }),
        },
      },
      observe: {
        question: 'The black ticks on the polar plot mark every direction you can pull along without shear. Where do they sit on the curve E(φ)?',
        options: [
          { text: 'At its maxima and minima', correct: true },
          { text: 'Where it is steepest', feedback: 'Where E(φ) is steepest the shear is largest. Look at where the ticks meet the curve.' },
          { text: 'Halfway between the fibres and the cross-fibre direction', feedback: 'There are no ticks at 45° for this ply.' },
        ],
      },
      explain: [
        'The no-shear directions are exactly where E(φ) is stationary. This is not a coincidence. The shear produced by a pull along φ is proportional to the slope of the compliance:',
        '$\\dfrac{\\gamma_{nt}}{\\varepsilon_{nn}} = \\tfrac12\\,E\\,\\dfrac{d(1/E)}{d\\varphi}$',
        'with φ in radians. So it vanishes exactly at the maxima and minima of E(φ), and along those directions the strain is coaxial with the load.',
        '**Why:** write the pull along φ as $\\boldsymbol\\sigma_V = \\sigma\\,\\mathbf a$ with $\\mathbf a = (\\cos^2\\varphi, \\sin^2\\varphi, \\sin\\varphi\\cos\\varphi)$. Then $1/E = \\mathbf a^{\\mathsf T}\\bar{\\mathbf S}\\mathbf a$. The derivative $\\mathbf b = d\\mathbf a/d\\varphi$ is exactly the vector that reads the shear strain, $\\gamma_{nt} = \\mathbf b^{\\mathsf T}\\boldsymbol\\varepsilon_V = \\sigma\\,\\mathbf b^{\\mathsf T}\\bar{\\mathbf S}\\mathbf a$. Since $\\varepsilon_{nn} = \\sigma/E$ and $d(1/E)/d\\varphi = 2\\,\\mathbf b^{\\mathsf T}\\bar{\\mathbf S}\\mathbf a$, the relation follows.',
      ],
    },
    {
      title: 'A softer matrix',
      context: ['Back to fibres along x. The shear modulus G₁₂ is governed mostly by the resin, so a softer matrix means a lower G₁₂.'],
      setup: (s) => fresh('ortho-cfrp', s, fibres),
      show: ['directional'],
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
      try: {
        instructions: ['Lower G₁₂ and watch the shape of E(φ) and the black ticks.'],
        controls: [{ kind: 'param', key: 'G12' }],
        task: {
          goal: 'Lower G₁₂ until new ticks appear on the polar plot.',
          check: (_s, d) => !d.coaxial.all && d.coaxial.angles.length >= 3,
          solve: (s) => withParam(s, 'G12', 4_000),
        },
      },
      observe: {
        question: 'What does E(φ) do at the new ticks?',
        options: [
          { text: 'It has a minimum there, lower than E₂ across the fibres', correct: true },
          { text: 'It has a maximum there', feedback: 'Compare the curve at the new ticks with its value across the fibres (90°).' },
          { text: 'Nothing special: they mark where E(φ) crosses a circle', feedback: 'The ticks mark stationary points: the curve turns there.' },
        ],
      },
      explain: [
        'Below $G_{12} \\approx 5.07$ GPa (for these E₁, E₂, ν₁₂) the minimum of E(φ) leaves the 90° direction and moves off-axis. The weakest direction is then neither along nor across the fibres, and pulling along it produces no shear either.',
        'The condition is $1/G_{12} > 2/E_2 + 2\\nu_{12}/E_1$. Composites with a compliant matrix often satisfy it.',
      ],
    },
    {
      title: 'Check a new direction',
      context: ['Each new tick claims that a pull along it does not shear the ply.'],
      show: ['directional', 'response'],
      try: {
        instructions: ['Rotate the fibres until the load axis x lies along one of the new off-axis ticks, and watch γxy.'],
        controls: [{ kind: 'theta' }],
        task: {
          goal: 'Put x on a new off-axis tick (not along or across the fibres) and check that γxy is practically zero.',
          check: (s, d) => Math.abs(Math.sin((2 * s.thetaDeg * Math.PI) / 180)) > 0.5 && Math.abs(shearPerStretch(d.response.strain)) < 0.02,
          solve: (s) => {
            const offAxis = deriveLab({ ...s, thetaDeg: 0 }).coaxial.angles.find((a) => Math.abs(Math.sin(2 * a)) > 0.5);
            if (offAxis === undefined) return s;
            let deg = -Math.round((offAxis * 180) / Math.PI);
            if (deg <= -90) deg += 180;
            return { ...s, thetaDeg: deg };
          },
        },
      },
      explain: [
        'There the pull is coaxial: γxy is zero to within the 1° step of the angle, although the load is far from both symmetry axes. The minimum of E(φ) sits there, which is why the coupling vanishes.',
      ],
    },
    {
      title: 'Coupling built into the material',
      context: [
        'Some materials shear under tension even in their own axes. In this monoclinic material the coupling is a material constant, $\\eta_{12,1} = \\gamma_{12}/\\varepsilon_{1}$ under $\\sigma_1$, and the pull runs along axis 1.',
      ],
      setup: (s) => fresh('mono-coupled', s, fibres),
      show: ['matrices', 'response'],
      predict: {
        question: 'If η₁₂,₁ were driven from positive through zero to negative, what would happen to the skew?',
        options: [
          { text: 'It would shrink to zero and reverse direction', correct: true },
          { text: 'It would shrink to zero and stay there', feedback: 'Zero is a point on the way, not a limit: η is a signed constant.' },
          { text: 'It would grow', feedback: 'The skew is proportional to η₁₂,₁. Its size follows |η| and its direction follows the sign.' },
        ],
      },
      try: {
        instructions: ['Drag η₁₂,₁ down through zero (it snaps there) and keep going.'],
        controls: [{ kind: 'param', key: 'eta12_1' }],
        task: {
          goal: 'Make the specimen shear the other way (γxy < 0) under the same pull.',
          check: (_s, d) => d.response.strain[2] < 0,
          solve: (s) => withParam(s, 'eta12_1', -0.5),
        },
      },
      explain: [
        'Under uniaxial stress the shear strain is $\\gamma_{xy} = \\eta_{12,1}\\,\\varepsilon_{xx}$: the sign of the coupling constant sets the direction of the skew. Like E and ν, η is a compliance quantity, read from a free (traction-controlled) test.',
        'So which stiffness entry would you expect to vanish when the skew does? That question is taken up in the guide “If C̄₁₆ = 0, can the specimen still shear?”.',
      ],
    },
  ],
};
