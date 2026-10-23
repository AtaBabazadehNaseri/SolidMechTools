import type { LabDerived, LabState } from '../app/lab';
import { STRAIN6_TEX, STRESS6_TEX, fmt, toGPa, toMilli } from '../app/format';
import { Tex } from './Tex';

/** The cube's response: all six components, the strain energy, and the apparent stiffness along x. */
export function Readouts3D({ state, derived }: { state: LabState; derived: LabDerived }) {
  const { response, energy, apparentModulus: am } = derived.solid;
  const sTol = 1e-9 * Math.max(...response.stress.map(Math.abs), 1e-300);
  const eTol = 1e-9 * Math.max(...response.strain.map(Math.abs), 1e-300);

  return (
    <section className="panel readouts">
      <h2>Response (cube)</h2>
      <table className="state-table">
        <thead>
          <tr>
            <th />
            <th>σ (MPa)</th>
            <th>ε (10⁻³)</th>
          </tr>
        </thead>
        <tbody>
          {response.stress.map((s, i) => {
            const applied = state.load3.control[i] === 'stress';
            return (
              <tr key={i}>
                <th>
                  <Tex>{STRESS6_TEX[i]}</Tex> / <Tex>{STRAIN6_TEX[i]}</Tex>
                </th>
                <td className={applied ? 'val applied' : 'val reaction'}>
                  {fmt(s, 4, sTol)}
                  <span className="role">{applied ? 'prescribed' : 'reaction'}</span>
                </td>
                <td className={applied ? 'val' : 'val held'}>
                  {fmt(toMilli(response.strain[i]), 4, toMilli(eTol))}
                  <span className="role">{applied ? 'response' : 'prescribed'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="energy">
        Strain energy density <Tex>{'W = \\tfrac12\\,\\boldsymbol{\\sigma}\\cdot\\boldsymbol{\\varepsilon}'}</Tex> = <b>{fmt(energy * 1000, 4)}</b> kJ/m³
      </div>

      <h3>
        Apparent stiffness dσxx/dεxx = <span className="ladder-now">{fmt(toGPa(am.value), 4)} GPa</span>
      </h3>
      <p className="hint">
        With the current controls: between <Tex>{'1/S_{11}'}</Tex> = {fmt(toGPa(am.free), 4)} GPa (every other component free, Young’s
        modulus along x) and <Tex>{'C_{11}'}</Tex> = {fmt(toGPa(am.locked), 4)} GPa (every other strain held). Each hold can only raise it.
      </p>
    </section>
  );
}
