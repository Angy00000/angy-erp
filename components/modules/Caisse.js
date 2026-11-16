import { useState } from 'react';
import { op, crud, money, opts, today } from '../../lib/client';
import { Tabs, useData, Stat, invalidateRefs } from '../ui';
import CrudTable from '../CrudTable';
import ActionModal from '../ActionModal';

export const EXPENSE_CATS = ['Matières premières', 'Emballages', 'Transport', 'Loyer', 'Électricité', 'Eau', 'Gaz', 'Téléphone / Internet', 'Entretien / réparation', 'Marketing', 'Impôts & taxes', 'Frais bancaires', 'Fournitures', 'Hygiène / nettoyage', 'Divers'];

export default function Caisse() {
  const [tab, setTab] = useState('accounts');
  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[['accounts', 'Comptes & soldes'], ['journal', 'Journal de trésorerie'], ['expenses', 'Dépenses']]} />
      {tab === 'accounts' && <Accounts />}
      {tab === 'journal' && <Journal />}
      {tab === 'expenses' && <Expenses />}
    </div>
  );
}

function Accounts() {
  const { data, reload } = useData(() => crud.list('accounts'), []);
  const [modal, setModal] = useState(null);
  const accs = data || [];
  const total = accs.filter((a) => a.active).reduce((s, a) => s + a.balance, 0);
  const done = (ok) => { setModal(null); if (ok) { invalidateRefs('accounts'); reload(); } };
  return (
    <div>
      <div className="grid g4">
        <Stat accent k="Trésorerie totale" v={money(total)} />
        {accs.filter((a) => a.active).map((a) => <Stat key={a.id} k={a.name} v={money(a.balance)} />)}
      </div>
      <div className="space" />
      <div className="toolbar">
        <button className="btn" onClick={() => setModal('in')}>+ Entrée d'argent</button>
        <button className="btn" onClick={() => setModal('out')}>− Sortie d'argent</button>
        <button className="btn" onClick={() => setModal('transfer')}>⇄ Transfert entre comptes</button>
      </div>
      <CrudTable entity="accounts" title="Compte de trésorerie" newLabel="Nouveau compte" onSaved={reload}
        columns={[{ k: 'name', l: 'Compte', fmt: (r) => <span className="strong">{r.name}</span> }, { k: 'type', l: 'Type', map: 'account_type' }, { k: 'initial_balance', l: 'Solde initial', t: 'money' }, { k: 'balance', l: 'Solde actuel', t: 'money' }, { k: 'active', l: 'Actif', t: 'bool' }]}
        defaults={{ type: 'caisse', active: true, initial_balance: 0 }}
        fields={[{ k: 'name', l: 'Nom', req: true }, { k: 'type', l: 'Type', t: 'select', opts: opts('account_type') }, { k: 'initial_balance', l: 'Solde initial', t: 'number' }, { k: 'active', l: 'Actif', t: 'bool' }]}
      />
      {(modal === 'in' || modal === 'out') && (
        <ActionModal title={modal === 'in' ? 'Entrée d\'argent' : 'Sortie d\'argent'} initial={{ date: today(), direction: modal }}
          fields={[{ k: 'account_id', l: 'Compte', t: 'ref', ref: 'accounts', req: true }, { k: 'amount', l: 'Montant', t: 'number', req: true }, { k: 'date', l: 'Date', t: 'date' },
            { k: 'category', l: 'Catégorie', t: 'select', opts: (modal === 'in' ? ['Apport', 'Subvention', 'Prêt', 'Autre recette'] : ['Retrait', 'Remboursement prêt', 'Autre dépense']).map((x) => [x, x]) },
            { k: 'label', l: 'Libellé', full: true, req: true }]}
          onSubmit={(d) => op('cash_move', d)} onClose={done} />
      )}
      {modal === 'transfer' && (
        <ActionModal title="Transfert entre comptes" initial={{ date: today() }}
          fields={[{ k: 'from', l: 'Depuis', t: 'ref', ref: 'accounts', req: true }, { k: 'to', l: 'Vers', t: 'ref', ref: 'accounts', req: true }, { k: 'amount', l: 'Montant', t: 'number', req: true }, { k: 'date', l: 'Date', t: 'date' }, { k: 'label', l: 'Libellé', full: true }]}
          onSubmit={(d) => op('cash_transfer', d)} onClose={done} />
      )}
    </div>
  );
}

function Journal() {
  return (
    <CrudTable entity="cash_transactions" title="Mouvement" dateRange csvName="journal-tresorerie" canCreate={false}
      filters={[{ k: 'account_id', l: 'Compte', ref: 'accounts' }]}
      columns={[
        { k: 'date', l: 'Date', t: 'date' }, { k: 'account_name', l: 'Compte' }, { k: 'category', l: 'Catégorie' }, { k: 'label', l: 'Libellé' },
        { k: 'in', l: 'Entrée', r: true, fmt: (r) => (r.amount > 0 ? <span className="pos">{money(r.amount)}</span> : ''), csv: (r) => (r.amount > 0 ? r.amount : '') },
        { k: 'out', l: 'Sortie', r: true, fmt: (r) => (r.amount < 0 ? <span className="neg">{money(-r.amount)}</span> : ''), csv: (r) => (r.amount < 0 ? -r.amount : '') },
        { k: 'user_name', l: 'Par' },
      ]}
      sums={['amount']}
    />
  );
}

function Expenses() {
  return (
    <CrudTable entity="expenses" title="Dépense" dateRange csvName="depenses" newLabel="Nouvelle dépense"
      filters={[{ k: 'category', l: 'Catégorie', opts: EXPENSE_CATS.map((c) => [c, c]) }, { k: 'account_id', l: 'Compte', ref: 'accounts' }]}
      columns={[{ k: 'date', l: 'Date', t: 'date' }, { k: 'category', l: 'Catégorie' }, { k: 'label', l: 'Libellé', fmt: (r) => <span className="strong">{r.label}</span> }, { k: 'supplier_name', l: 'Fournisseur' }, { k: 'production_number', l: 'Production' }, { k: 'account_name', l: 'Payé via' }, { k: 'amount', l: 'Montant', t: 'money' }]}
      sums={['amount']}
      defaults={() => ({ date: today(), category: 'Divers' })}
      fields={[
        { k: 'label', l: 'Libellé', req: true, full: true }, { k: 'amount', l: 'Montant', t: 'number', req: true },
        { k: 'category', l: 'Catégorie', t: 'select', opts: EXPENSE_CATS.map((c) => [c, c]) }, { k: 'date', l: 'Date', t: 'date', req: true },
        { k: 'account_id', l: 'Payé via (compte)', t: 'ref', ref: 'accounts', help: 'Le compte sera débité automatiquement' },
        { k: 'supplier_id', l: 'Fournisseur', t: 'ref', ref: 'suppliers', quickCreate: { label: 'fournisseur', fields: ['name', 'phone'] } },
        { k: 'production_id', l: 'Rattacher à une production (optionnel)', t: 'ref', ref: 'production_orders', label: (r) => `${r.number} — ${r.product_name || ''}${r.lot_number ? ' · lot ' + r.lot_number : ''}`, help: 'La dépense sera ajoutée au coût de cette production' },
        { k: 'reference', l: 'Référence / n° pièce' },
      ]}
    />
  );
}
