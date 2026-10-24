# Elastic material format, version 1

A JSON format for one linear elastic material, its orientation and, optionally, a Lab view. The Lab's share links use it now; saving and loading files will use it later.

The format is universal because it is explicit. Every choice that has more than one convention in the wild is written into the file, so the data can be read without this application.

## Rules

1. **One authoritative definition.** The material is stored once, as entered: as constants or as a matrix. Derived values are not stored, so they can never disagree with the definition.
2. **Conventions are spelled out:** the units, the matrix kind, the component order and the shear convention. Poisson ratios always use ν_ij = −ε_j/ε_i under σ_i alone.
3. **Material, orientation and view are separate blocks.** A file with only `material` is a reusable material; `orientation` and `view` are optional.
4. **Versioned.** Readers refuse a `format` they do not know, or a `version` newer than they support.

## Top level

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"solidmechtools.elastic-material"`. |
| `version` | yes | `1`. |
| `name` | no | Display name. |
| `source` | no | Free text: reference, DOI, temperature, assumptions. |
| `units` | yes | Stress unit for moduli and stiffness entries: `Pa`, `kPa`, `MPa`, `GPa`, `TPa`, `psi`, `ksi` or `Msi`. Compliance entries are in 1/`units`. Dimensionless ratios are unaffected. |
| `material` | yes | See below. |
| `orientation` | no | The material axes 1, 2, 3 written in the specimen axes x, y, z. |
| `view` | no | Lab state to restore: `thetaDeg` (number), `mode` (`"stress"` or `"strain"`). |

## `material`, constants form

| Field | Meaning |
|---|---|
| `dimension` | `3` or `2`. |
| `definition` | `"constants"`. |
| `symmetry` | 3D: `isotropic`, `cubic`, `hexagonal`, `tetragonal`, `trigonal`, `orthotropic`, `monoclinic` or `triclinic`. 2D: `isotropic`, `square`, `orthotropic` or `anisotropic`. |
| `plane` | 2D only: `"stress"` or `"strain"`, the state the constants describe. |
| `constants` | Object of the class's constants, keys as listed below. |

Keys, in the class's own axis convention:

| Class | Keys |
|---|---|
| isotropic (3D) | `E1`, `nu12` |
| cubic | `E1`, `nu12`, `G12` (axes along the cube edges) |
| hexagonal | `E1`, `nu12`, `E3`, `nu13`, `G13` (axis 3 is the symmetry axis) |
| tetragonal | `E1`, `nu12`, `E3`, `nu13`, `G13`, `G12` (axis 3 is the 4-fold axis, axis 1 a 2-fold axis) |
| trigonal | `E1`, `nu12`, `E3`, `nu13`, `G13`, `eta23_1` (axis 3 is the 3-fold axis, axis 1 a 2-fold axis) |
| orthotropic | `E1`, `E2`, `E3`, `nu12`, `nu13`, `nu23`, `G23`, `G13`, `G12` |
| monoclinic | the orthotropic keys, plus `eta12_1`, `eta12_2`, `eta12_3`, `mu13_23` (axis 3 is the 2-fold axis) |
| triclinic | the 6 moduli `E1`, `E2`, `E3`, `G23`, `G13`, `G12`, plus all 15 couplings `nuij`, `etaKL_i`, `muKL_MN` |
| isotropic (2D) | `E1`, `nu12` |
| square (2D) | `E1`, `nu12`, `G12` |
| orthotropic (2D) | `E1`, `E2`, `nu12`, `G12` |
| anisotropic (2D) | `E1`, `E2`, `nu12`, `G12`, `eta12_1`, `eta12_2` |

Each constant is a compliance quantity from a test with one stress acting alone, the lower index being the loaded direction:
- `E_i` = σ_i/ε_i;
- `G_ij` = τ_ij/γ_ij;
- `nu_ij` = −ε_j/ε_i;
- `etaKL_i` = γ_KL/ε_i;
- `muKL_MN` = γ_KL/γ_MN.

## `material`, matrix form

| Field | Meaning |
|---|---|
| `dimension` | `3` (6×6) or `2` (3×3). |
| `definition` | `"matrix"`. |
| `plane` | 2D only: `"stress"` or `"strain"`, the state the 3×3 matrix describes. |
| `kind` | `"stiffness"` (σ = C ε) or `"compliance"` (ε = S σ). |
| `order` | Component order of rows and columns: `["11","22","33","23","13","12"]` or `["11","22","33","12","13","23"]` in 3D, `["11","22","12"]` in 2D. |
| `shear` | `"engineering"` (strain vector with γ = 2ε), `"tensor"` (tensor components C_ijkl or S_ijkl in matrix positions) or `"mandel"` (√2 on each shear component of both vectors). |
| `matrix` | The full square matrix, row by row. It must be symmetric. |

## `orientation`

`axis1`, `axis2` and `axis3` are the unit vectors of material axes 1, 2 and 3, written in x, y, z. They must form a right-handed orthonormal set to within 1e-3, which allows rounded direction cosines such as 0.866. Readers replace them with the nearest exact rotation and must refuse anything further off, or left-handed. If the block is omitted, the material axes coincide with x, y, z. In 2D only rotations about z are meaningful.

## Example: constants

```json
{
  "format": "solidmechtools.elastic-material",
  "version": 1,
  "name": "ORT-9B",
  "source": "Illustrative values; out-of-plane values assume transverse isotropy about the fibres",
  "units": "GPa",
  "material": {
    "dimension": 3,
    "definition": "constants",
    "symmetry": "orthotropic",
    "constants": { "E1": 180, "E2": 10, "E3": 10, "nu12": 0.3, "nu13": 0.3, "nu23": 0.4, "G23": 3.571, "G13": 7, "G12": 7 }
  },
  "orientation": { "axis1": [0.866, 0.5, 0], "axis2": [-0.5, 0.866, 0], "axis3": [0, 0, 1] },
  "view": { "thetaDeg": 0, "mode": "stress" }
}
```

## Example: matrix

```json
{
  "format": "solidmechtools.elastic-material",
  "version": 1,
  "name": "CUB-3A",
  "units": "GPa",
  "material": {
    "dimension": 3,
    "definition": "matrix",
    "kind": "stiffness",
    "order": ["11", "22", "33", "23", "13", "12"],
    "shear": "engineering",
    "matrix": [
      [170, 120, 120, 0, 0, 0],
      [120, 170, 120, 0, 0, 0],
      [120, 120, 170, 0, 0, 0],
      [0, 0, 0, 75, 0, 0],
      [0, 0, 0, 0, 75, 0],
      [0, 0, 0, 0, 0, 75]
    ]
  }
}
```

## Share links

A share link carries one material document in the URL fragment: `#material=` followed by the base64url encoding (RFC 4648 §5, without padding) of its UTF-8 JSON. Links use the constants form, with every value at full double precision.
