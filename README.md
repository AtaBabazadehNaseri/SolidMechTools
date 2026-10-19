# SolidMechTools

Interactive tools for building physical intuition in solid mechanics.

## Elasticity Tensor Lab

**Try it: https://atababazadehnaseri.github.io/SolidMechTools/** (runs in the browser; best on a laptop or desktop)

![Elasticity Tensor Lab: an off-axis carbon/epoxy ply shearing under pure tension](public/og-image.png)

A homogeneous specimen cut from a 3D linear elastic material, in plane stress
or plane strain. Material constants are the controls; the stiffness and
compliance matrices are read-only consequences. Each in-plane component is
either **traction-controlled** (stress prescribed) or **displacement-controlled**
(strain prescribed). This one switch moves the specimen between a free test,
which reads columns of S̄, and a fully constrained test, which reads columns of C̄.

Also in the lab:
- principal stress and strain axes, and their misalignment;
- a cut plane with Mohr's circle;
- the stiffness eigenmodes (Kelvin modes);
- directional moduli and anisotropy indices;
- symmetry detection for the current constants;
- snapping knobs ("= E₁", "isotropic in the 1–2 plane", "0");
- real-material presets for all eight symmetry classes.

### Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # mechanics verification suite
npm run build      # static site in dist/
```

### Layout

```
src/mechanics/   constitutive math only: no UI imports, unit-tested
  linalg.ts        small dense linear algebra (Cholesky, Gauss–Jordan, Jacobi)
  tensor.ts        Voigt/Mandel conventions, rotations built from R_M,ab = B_a : R B_b Rᵀ
  materials.ts     8 symmetry classes as engineering constants, section planes, presets
  plane.ts         plane stress (S̄ = S[1,2,6]) and plane strain (C̄ = C[1,2,6]), mixed control,
                   directional moduli, coaxial directions
  principal.ts     principal values, tractions on a cut, Kelvin modes of C̄
  admissibility.ts positive definiteness, exact admissible interval of each knob
  anisotropy.ts    Voigt/Reuss, universal index A^U, E(n) extremes
  symmetry.ts      effective symmetry by invariance, matrix patterns
  snapping.ts      admissible snap targets for knobs
  constants.ts     apparent engineering constants, Kelvin moduli
src/app/         state, actions, experiments, derived quantities
src/guides/      guided experiences: scripts over the same lab state, tested without the UI
src/ui/          React + SVG views
```

### Guides

The app opens in the **Lab**. The **Guides** tab holds eleven short guided experiences at three levels.
Each step sets up the specimen, shows only the panels it needs, and runs through up to five phases:
1. **Context**: what is on screen and what is fixed. It gives no instructions.
2. **Predict**: a multiple-choice question, asked only when the answer is not yet on screen. A reveal can hold back the load until the learner answers.
3. **Try**: instructions, the unlocked controls, and a task that is checked automatically, with a "Show me" fallback.
4. **Observe**: "what did you see?", asked once the task is done.
5. **Explain**.

Entering a step by any route (Next, Back, the step dots, Restart) rebuilds the state the step is written for. "Continue in the Lab" hands over the exact current state.

To add a guide:
1. Write a `Guide` object in `src/guides/`; the step format is documented in `src/guides/types.ts`.
2. Register it in `src/guides/index.ts`.
3. Add any numbers it quotes to `guides.test.ts`.

The tests walk every guide as a learner who presses "Show me", and they also jump straight to every step. They check that:
- each task starts unsolved, including before its prediction, and "Show me" solves it;
- each question has exactly one correct option;
- each number a guide quotes matches the engine.

`deferred/` keeps a guide whose out-of-plane steps wait for the 3D mode. It is not compiled.

### Conventions

- Voigt order 11, 22, 33, 23, 13, 12 with engineering shear strain. Rotations go
  through the Mandel form.
- Units: MPa internally; stiffness shown in GPa, compliance in TPa⁻¹.
- Engineering constants are defined from the lower Voigt index as the loaded
  direction: ν₁₂ = −ε₂/ε₁ under σ₁, η₁₂,₁ = γ₁₂/ε₁ under σ₁.
- Each knob holds the other constants of its class fixed. The compliance is then
  affine in 1/modulus or in the ratio, so the admissible range of each knob is
  an exact open interval (generalized eigenvalues of the knob direction against
  the current S).
- Presets marked "illustrative" are designed to show a behaviour; they are not
  material data.

### Deployment

Every push to `main` runs the tests, builds the site and publishes `dist/` to
GitHub Pages (`.github/workflows/deploy.yml`). In the repository settings,
Pages → Source must be set to **GitHub Actions**.

### Status

Built with AI assistance (Claude). The mechanics is checked by an automated
test suite against analytical results, symmetry and invariance properties, and
published material data. It has not been independently reviewed by a human
expert. Corrections are welcome via issues.
