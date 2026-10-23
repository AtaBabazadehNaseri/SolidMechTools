# Bring your own material: specification

Status: agreed 2026-10-22. First engineering extension of the Elasticity Tensor Lab.

## Purpose

A user enters the elastic data they actually have. The Lab:
- checks that the data is usable;
- shows the material in every other form;
- runs every Lab view and guide-style explanation on it.

The priorities are, in order: visibility, educational value, then day-to-day engineering use.

## Inputs

The material comes in one of four forms:

| | Matrix | Constants |
|---|---|---|
| **3D** | C or S, 6×6 | symmetry class (8 classes) and its constants |
| **2D** | C̄ or S̄, 3×3, declared as plane stress or plane strain | in-plane class (4 classes) and its constants, e.g. E₁, E₂, ν₁₂, G₁₂ |

The orientation of the material axes in the specimen axes x, y, z is entered separately:
- **3D:** the direction of axis 1, plus any vector lying in the 1–2 plane. The tool normalizes them, makes them perpendicular and derives axis 3 as axis 1 × axis 2. Alternatively, a full 3×3 matrix of direction cosines is accepted. It must be right-handed and orthonormal to within 1e-3, and is replaced by the nearest exact rotation. The section presets (⟂ axis 3, ⟂ axis 1, ⟂ axis 2, ⟂ [111]) remain one-click shortcuts.
- **2D:** the angle of axis 1 from x.

In both cases the θ slider still rotates the material on top of this orientation.

A pasted matrix also needs:
- **Units:** Pa, kPa, MPa, GPa, TPa, psi, ksi or Msi. A compliance is read in 1/unit.
- **Component order:** 11, 22, 33, 23, 13, 12 (the Voigt order used in papers and in this Lab), or 11, 22, 33, 12, 13, 23. For 2D data the order is always 11, 22, 12.
- **Shear convention:**
  - *engineering*: the standard Voigt form, with γ = 2ε in the strain vector;
  - *tensor components*: C_ijkl or S_ijkl written into Voigt positions. For C this is identical to engineering; for S, the shear entries differ by factors of 2 and 4;
  - *Mandel*: a √2 on each shear component.

  The defaults (GPa, Voigt order, engineering shear) cover almost every paper.

The text parser accepts any of three layouts, separated by spaces, commas, semicolons or tabs, and skips `#` comment lines:
- a full matrix;
- its upper triangle;
- its lower triangle.

## Checks on loading (the minimal verdict)

Loading is refused, with a plain-words reason, when:
- the text does not parse into the expected size;
- the matrix is not symmetric beyond rounding. An asymmetry above 1 % of the largest entry is refused; anything smaller is averaged out, with a note;
- the material is not stable (not positive definite). The message names the negative Kelvin mode by its dominant strain components.

The check also reports how far a pasted matrix is from each symmetry class, as a distance in the given axes. A class that matches to within rounding is offered as the class to load. The matrix is then replaced by its nearest member of that class, its average over the class's symmetry operations, and the user's constants become that class's knobs. A material that is transversely isotropic, tetragonal, trigonal or monoclinic about axis 1 or 2 is relabelled into the class convention (distinguished axis along 3). The orientation is adjusted so that the specimen sees exactly the same material.

The "convention detective" is deferred: heuristics that guess shear factors, swapped Poisson ratios or wrong units.

## 2D data is an incomplete material

A 3×3 matrix, or in-plane constants, fixes only the in-plane response. Internally the material is embedded in 3D with a decoupled out-of-plane placeholder. That reproduces the entered in-plane matrix exactly in either mode, and admissibility becomes in-plane positive definiteness, so an isotropic sheet allows −1 < ν < 1. Nothing computed from the placeholder is shown. Instead, these are unavailable and greyed out with "needs 3D data":
- switching between plane stress and plane strain (the mode is fixed to the one declared);
- the out-of-plane strains and reactions;
- the full 3D tensors and the 3D engineering constants;
- the 3D anisotropy indices and the 3D Kelvin moduli;
- changing the section plane.

The engineering constants of plane-strain data are effective plane-strain constants. They are labelled as such.

## Outputs

- **Other forms of the material** (a panel under the Lab):
  - C and S (6×6, 3D materials only);
  - C̄ and S̄ for plane stress and for plane strain (3D materials), or for the declared mode (2D data);
  - the engineering constants, in material axes or in specimen axes, including the minor Poisson ratios ν₂₁, ν₃₁ and ν₃₂;
  - any of the notations and units above, each with a copy-as-text button.
- **Understanding:** every Lab view runs on the user's material.
- **Share link:** the current material, its orientation, θ and mode, encoded in the URL using the material format of `material-format.md`. Opening the link loads it. Nothing is written to disk.

## Deferred

- Saving and loading material files (JSON, `material-format.md`) and CSV import of a matrix.
- A one-page printable summary.
- The convention detective.
- Finding the symmetry axes of a matrix given in arbitrary axes.
- Solver cards, a Python package, DFT-derived properties, nonlinear models.
