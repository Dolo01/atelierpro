# AtelierPro

Plateforme SaaS PWA de gestion des ateliers de couture : clients, mesures, devis, commandes, paiements, suivi de fabrication, abonnements validés manuellement. Montants en FCFA.

**Stack :** React 18 + TypeScript, Tailwind CSS, Vite + vite-plugin-pwa (application installable), Supabase (base de données, authentification, stockage).

---

## 1. Démarrer en local

Prérequis : Node.js 18 ou plus récent.

```bash
cd atelierpro
npm install
npm run dev
```

Ouvrez ensuite http://localhost:5173.

Le projet est déjà relié au projet Supabase **atelierpro** (région Paris) : les valeurs par défaut sont dans `src/lib/supabase.ts`. Pour pointer vers un autre projet, copiez `.env.example` en `.env` et modifiez :

```
VITE_SUPABASE_URL=https://yukdbvkqnpdukfvzeozw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La clé « publishable » peut être exposée côté navigateur : c'est la sécurité RLS de la base qui protège les données.

## 2. Réglage obligatoire dans Supabase (une seule fois)

Les comptes se connectent avec leur **numéro de téléphone + mot de passe**. En interne, le numéro devient une adresse technique (`22376000000@tel.atelierpro.app`). Aucun email n'est envoyé.

Dans le tableau de bord Supabase, désactivez donc la confirmation par email :

**Authentication → Sign In / Providers → Email → décochez « Confirm email » → Save.**

Sans ce réglage, l'inscription d'un tailleur ou l'activation d'un client affichera « Compte non confirmé ».

## 3. Compte superadministrateur

Un compte superadmin est déjà créé :

- Identifiant : **kassoumdolo2@gmail.com** (la connexion accepte un email ou un numéro de téléphone)
- Mot de passe : défini par le superadmin dans Réglages → Mon mot de passe.

Premières actions conseillées côté superadmin :

1. **Réglages** : saisir les numéros Orange Money, Wave et Moov Money qui recevront les dépôts. Tant qu'aucun numéro n'est saisi, les tailleurs ne peuvent pas payer.
2. **Forfaits** : ajuster les forfaits de départ (Solo 3 000, Atelier 7 500, Maison de couture 15 000 FCFA/mois). Ce sont des exemples à modifier.

Pour promouvoir un autre compte en superadmin (SQL Editor de Supabase) :

```sql
update public.profiles set role = 'superadmin'
where id = (select id from auth.users where email = '223XXXXXXXX@tel.atelierpro.app');
```

## 4. Les trois espaces

| Espace | Accès | Contenu |
|---|---|---|
| Tailleur | `/inscription` puis `/accueil` | Clients, mesures avec historique, devis envoyés par WhatsApp, commandes et étapes de fabrication, avances et soldes, agenda, rapports, employés selon le forfait, abonnement |
| Client | Lien d'invitation WhatsApp `/invitation/<jeton>` puis `/espace` | Devis à accepter ou refuser, suivi de fabrication, mesures (lecture seule), paiements, notifications |
| Superadmin | `/admin` | Paiements à vérifier, ateliers (suspension, prolongations), forfaits, essai gratuit, numéros de dépôt, journal |

## 5. Règles métier garanties par la base de données

- **Chaque atelier est isolé** : un atelier ne peut ni lire ni modifier les clients, mesures, devis, commandes ou paiements d'un autre (RLS sur toutes les tables).
- **Un client ne voit que ses propres données.**
- **Le superadmin ne voit pas les mesures des clients.**
- **Essai gratuit automatique** de 30 jours (modifiable par le superadmin) à l'inscription.
- **Aucun accès payant sans validation** : le tailleur ne peut pas modifier lui-même son abonnement. Seule la fonction `admin_review_payment` (réservée au superadmin) l'active.
- **Le montant d'une demande de paiement est recalculé par le serveur** à partir du forfait.
- **Une seule demande en attente** par atelier.
- **Invitations** : jeton aléatoire stocké haché (SHA-256), valable 48 h, utilisable une seule fois.
- **Accès expiré** : l'atelier garde la lecture de ses données mais ne peut plus rien créer tant qu'il n'a pas un forfait validé.
- **Atelier suspendu** : plus aucun accès.
- **Journal** : chaque validation, rejet, suspension, prolongation, changement de forfait ou de réglage est enregistré.
- **Preuves de paiement** : stockées dans un bucket privé `payment-proofs`, visibles seulement par l'atelier concerné et le superadmin.

## 6. Mise en ligne (Vercel ou Render)

```bash
npm run build      # génère le dossier dist/
```

- **Vercel** : importez le dossier, framework « Vite », ajoutez les deux variables `VITE_SUPABASE_*`. Le fichier `vercel.json` gère déjà les routes de l'application.
- **Render** : « Static Site », commande `npm install && npm run build`, dossier `dist`, ajoutez une règle *Rewrite* `/*` → `/index.html`.

Une fois en ligne, les liens d'invitation et de devis envoyés par WhatsApp pointent automatiquement vers l'adresse du site.

## 7. Structure

```
supabase/migrations/   Schéma SQL, sécurité RLS, fonctions métier (déjà appliqués sur le projet)
public/                Logo, icônes PWA, image de connexion
src/lib/               Client Supabase, authentification, formats (FCFA, téléphone, WhatsApp), types
src/components/ui.tsx  Composants d'interface
src/layouts/Shell.tsx  Navigation (barre latérale sur ordinateur, onglets sur téléphone)
src/pages/auth/        Connexion, inscription, invitation, mot de passe
src/pages/tailor/      Espace tailleur
src/pages/client/      Espace client
src/pages/admin/       Espace superadmin
```

## 8. Évolutions prévues

- Envoi automatique par **WhatsApp Business Cloud API** (aujourd'hui : liens wa.me avec message prérempli).
- Photos des modèles et des tissus sur les commandes (Supabase Storage).
- Export des rapports.
# atelierpro
