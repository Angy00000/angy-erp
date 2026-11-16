import { DOCS, DOC_GROUPS } from '../imprimes';
import { Ic } from './Dashboard';

const ICON = { 'Production & qualité': 'factory', Stock: 'box', 'Ventes & caisse': 'receipt', Personnel: 'clock' };

export default function Imprimes({ company, go }) {
  return (
    <div>
      {!company?.logo && (
        <div className="note" style={{ marginBottom: 16 }}>
          Astuce : ajoutez votre logo dans <a href="/app/admin" onClick={(e) => { e.preventDefault(); go('admin'); }}><b>Administration → Entreprise</b></a> pour qu'il apparaisse sur toutes les fiches, factures et reçus.
        </div>
      )}
      {DOC_GROUPS.map(([g, keys]) => (
        <div key={g} style={{ marginBottom: 22 }}>
          <h3 className="imp-h"><Ic n={ICON[g]} s={17} />{g}</h3>
          <div className="imp-grid">
            {keys.map((k) => { const d = DOCS[k]; return (
              <a key={k} className="imp-card" href={`/imprimes/${k}`} target="_blank" rel="noreferrer">
                <span className="imp-ic"><Ic n={d.etat ? 'trend' : 'print'} s={20} /></span>
                <span className="imp-t"><b>{d.t}</b><small>{d.s}</small></span>
                <span className="imp-tags"><span className="badge gray">{d.f}</span>{d.etat ? <span className="badge green">État</span> : <span className="badge blue">Vierge</span>}</span>
              </a>
            ); })}
          </div>
        </div>
      ))}
    </div>
  );
}
