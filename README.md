# ERP

Logiciel de gestion complet pour entreprises de production — par Angy Company.

**Modules :** tableau de bord, ventes & point de vente, caisse & trésorerie (Caisse, Wave, Orange Money, Banque), stock par lots (FEFO, DLC), achats & fournisseurs, production (recettes, ordres de fabrication, coût de revient, rentabilité par production), qualité & HACCP (contrôles, libération des lots, non-conformités, traçabilité), RH (pointage, planning, paie), rapports, administration multi-utilisateurs avec rôles.

Multi-entreprises : chaque entreprise a son espace isolé.

## Stack
- Next.js (Pages Router) — interface + API
- PostgreSQL sur Neon (`@neondatabase/serverless`)
- Déploiement Vercel

## Lancer en local
```bash
npm install
cp .env.example .env.local   # renseigner DATABASE_URL et JWT_SECRET
npm run dev
```

## Structure
- `pages/api/auth` — connexion, inscription
- `pages/api/crud/[entity]` — moteur CRUD générique (config dans `lib/entities.js`)
- `pages/api/ops/[op]` — opérations métier (stock, production, ventes, paie…)
- `pages/api/reports/[report]` — rapports et tableaux de bord
- `components/modules/*` — écrans de chaque module

## Déploiement
Chaque push sur `main` est déployé automatiquement sur Vercel (projet `angy-erp`, https://angy-erp.vercel.app).
Variables d'environnement requises sur Vercel : `DATABASE_URL`, `JWT_SECRET`.
