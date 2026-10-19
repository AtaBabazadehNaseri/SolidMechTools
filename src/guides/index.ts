import type { Guide } from './types';
import { negativePoisson } from './a1-negative-poisson';
import { twoConstants } from './a2-two-constants';
import { pullWithoutShear } from './b1-pull-without-shear';
import { looksIsotropic } from './b2-looks-isotropic';
import { c16StillShears } from './c1-c16-still-shears';
import { planeStressInput } from './c2-plane-stress-input';

export * from './types';

/** Grouped by level. */
export const GUIDES: Guide[] = [negativePoisson, twoConstants, pullWithoutShear, looksIsotropic, c16StillShears, planeStressInput];
