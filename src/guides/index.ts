import type { Guide } from './types';
import { negativePoisson } from './a1-negative-poisson';
import { twoConstants } from './a2-two-constants';
import { e1VsEx } from './a3-e1-vs-ex';
import { pullWithoutShear } from './b1-pull-without-shear';
import { holdingStiffer } from './b2-holding-stiffer';
import { sculptE } from './b3-sculpt-e';
import { coaxiality } from './b4-coaxiality';
import { c16StillShears } from './c1-c16-still-shears';
import { planeStressInput } from './c2-plane-stress-input';
import { kelvinModes } from './c3-kelvin-modes';
import { anisotropyIndices } from './c4-anisotropy-indices';

export * from './types';

/** Grouped by level; within a level, roughly in the order they build on each other. */
export const GUIDES: Guide[] = [
  negativePoisson,
  e1VsEx,
  twoConstants,
  pullWithoutShear,
  holdingStiffer,
  sculptE,
  coaxiality,
  c16StillShears,
  planeStressInput,
  kelvinModes,
  anisotropyIndices,
];
