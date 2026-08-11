# Phase 1b — Statuts : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent la syntaxe à cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** permettre de qualifier le cheminement d'un membre — lui attribuer des statuts
cumulables, avec exclusivité par groupe, date d'acquisition, et un journal de tous les mouvements.

**Architecture :** on prolonge la phase 1a sans en changer les principes. Lectures sous RLS,
écritures exclusivement par Server Actions passant par `exigerAdministrateur`, refus par défaut.
La nouveauté : l'attribution d'un statut est une opération **composée** — elle peut évincer un
statut exclusif et doit journaliser les deux mouvements. Elle vit donc dans une fonction Postgres
appelée en RPC, ce qui la rend **atomique**. Une opération qui retirerait un statut sans réussir
à poser le suivant serait exactement la perte silencieuse que ce projet a corrigée neuf fois.

**Spécification de référence :** `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`
(décisions D6, D7, section 4.3).

**Ce plan ne livre PAS**, volontairement : la modification des statuts par un utilisateur non
administrateur. La spécification (§5.2) la réserve aux membres de sa **portée d'autorité**, qui
suppose l'arborescence faiseur de disciple — objet du plan 1c. En 1b, seul un administrateur
attribue et retire des statuts. Le plan 1c élargira les gardes, sans rien réécrire.

## Contraintes globales

- **Versions exactes**, déjà installées, à ne pas modifier : `next@16.3.0`, `react@19.2.8`,
  `typescript@6.0.3`, `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.12.4`, `vitest@4.1.10`,
  `tailwindcss@4.3.3`, `zod@4.4.3`, `@playwright/test@1.62.1`, `tsx@4.23.12`, `dotenv-cli`.
- **Langue** : code, tables, colonnes, fonctions, routes et messages en **français**.
  Identifiants SQL en `snake_case` minuscule.
- **Un seul projet Supabase** sert au développement et à la production. Migrations strictement
  additives, **jamais** `supabase db reset`, **jamais** de modification d'une migration appliquée.
- **Le déploiement automatique sur `git push` vers `main` est actif**, et il n'existe aucune
  intégration continue : les six suites se lancent localement avant de pousser.
- **Aucune politique RLS d'écriture** pour `anon` ou `authenticated`, sur aucune table, jamais.
- **Toute fonction appelée dans une politique RLS** est enveloppée dans `(select ...)`.
- **Toute page et toute Server Action traverse `exigerProfilActif` ou `exigerAdministrateur`**
  avant toute lecture ou écriture. Aucun appel direct à `profilCourant` hors de `garde.ts`.
- **Toute colonne de clé étrangère est indexée**, sauf si déjà en tête d'une clé primaire
  composite ou couverte par une contrainte `UNIQUE`.
- Types : `text`, `timestamptz`, `date`, `boolean`, `enum` Postgres pour les ensembles fermés.
- Dépôt GitHub **public** : aucun secret versionné, **aucun mot de passe littéral** dans un test.
- **Ne jamais toucher au compte `racine`** ni aux trois antennes d'origine.
- Les implémenteurs ne stagent que leurs propres fichiers, et n'utilisent **aucune commande à
  portée globale sur les processus**. Playwright gère ses propres navigateurs.
- **Commit après chaque tâche**, message en français, préfixe conventionnel.

### Les neuf défauts de la phase 1a, à ne pas reproduire

Un motif a dominé la phase précédente : des défauts qui **ne cassent rien mais qui mentent**.
Chaque tâche de ce plan doit être écrite en les ayant en tête, et chaque revue les cherchera.

1. **Ne jamais avaler une erreur de lecture ou d'écriture.** Une requête qui échoue doit lever,
   pas retomber sur une liste vide ou un `null` — sans quoi une panne devient « aucun résultat ».
2. **Toute écriture confirme avoir touché une ligne** (`.select('id')` puis vérification).
   PostgREST ne signale pas une mise à jour de zéro ligne.
3. **Toute action réversible doit avoir son inverse dans l'interface.** Un statut retiré doit
   pouvoir être remis ; sans quoi une erreur de manipulation devient définitive.
4. **Tout écran atteignable doit être atteint par un lien.** Une page livrée sans lien est une
   page invisible.
5. **Un écran qui modifie affiche le même contexte que l'écran qui montre.**
6. **Un message de confirmation dit ce qui se passe réellement**, sans dramatiser ni minimiser.
7. **Un test de refus est accompagné d'un contrôle positif** — sans quoi il resterait vert si
   tout était cassé.
8. **Un test qui protège une barrière est prouvé par mutation** : on retire la barrière, on
   vérifie que le test tombe, on rétablit.
9. **La documentation est relue quand le monde change autour d'elle**, pas seulement quand on
   la modifie.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/*_statuts.sql` | Tables `groupes_statut`, `statuts`, RLS, amorçage |
| `supabase/migrations/*_membre_statuts.sql` | `membre_statuts`, `journal_statuts`, garde d'exclusivité, fonctions d'attribution et de retrait |
| `src/lib/domaine/statut.ts` + `.test.ts` | Règles d'exclusivité et validation d'une date d'acquisition, TypeScript pur |
| `src/lib/donnees/statuts.ts` | Lectures typées : catalogue, statuts d'un membre, journal |
| `src/app/membres/[id]/statuts/actions.ts` | Attribution et retrait |
| `src/app/membres/[id]/statuts/page.tsx` | Écran d'attribution des statuts d'un membre |
| `src/app/membres/[id]/statuts/formulaire-statut.tsx` | Formulaire d'attribution (composant client) |
| `src/app/statuts/page.tsx` + `actions.ts` + `formulaire-statut-catalogue.tsx` | Gestion du catalogue par l'administrateur |
| `tests/rls/statuts.test.ts` | Politiques RLS des nouvelles tables |
| `tests/e2e/statuts.spec.ts` | Parcours d'attribution de bout en bout |

---

### Task 1 : Catalogue des statuts

**Files:**
- Create: `supabase/migrations/20260813100000_statuts.sql`

**Interfaces:**
- Consumes: `prive.est_actif()`, `prive.est_admin()` (phase 1a)
- Produces: tables `public.groupes_statut` et `public.statuts`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260813100000_statuts.sql` :

```sql
-- Catalogue des statuts (spec §4.3, décision D6).
-- Les statuts sont cumulables, sauf à l'intérieur d'un groupe marqué exclusif :
-- « non-croyant » et « repenti » décrivent le même axe et s'excluent, alors qu'un
-- baptême et un service en commission se cumulent sans difficulté.

create table public.groupes_statut (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  exclusif boolean not null default false,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint groupes_statut_nom_non_vide check (length(trim(nom)) > 0)
);

comment on column public.groupes_statut.exclusif is
  'Vrai si un membre ne peut porter qu''un seul statut de ce groupe à la fois.';

create table public.statuts (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references public.groupes_statut (id) on delete restrict,
  libelle text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint statuts_libelle_non_vide check (length(trim(libelle)) > 0),
  constraint statuts_libelle_unique_par_groupe unique (groupe_id, libelle)
);

comment on table public.statuts is
  'Statut attribuable à un membre. Désactivable, jamais supprimable : les attributions passées doivent rester lisibles.';

create index statuts_groupe_id_idx on public.statuts (groupe_id);

revoke all on public.groupes_statut from anon, authenticated;
revoke all on public.statuts from anon, authenticated;
grant select on public.groupes_statut to authenticated;
grant select on public.statuts to authenticated;

alter table public.groupes_statut enable row level security;
alter table public.groupes_statut force row level security;
alter table public.statuts enable row level security;
alter table public.statuts force row level security;

create policy groupes_statut_lecture on public.groupes_statut
  for select to authenticated using ((select prive.est_actif()));

create policy statuts_lecture on public.statuts
  for select to authenticated using ((select prive.est_actif()));

-- Aucune politique d'écriture : les mutations passent par des Server Actions.

-- Amorçage : les statuts nommés par la spécification (§4.3).
insert into public.groupes_statut (nom, exclusif, ordre) values
  ('Cheminement', true, 1),
  ('Engagements', false, 2);

insert into public.statuts (groupe_id, libelle, ordre)
select g.id, v.libelle, v.ordre
from public.groupes_statut g
join (values
  ('Cheminement', 'Non-croyant', 1),
  ('Cheminement', 'Repenti', 2),
  ('Engagements', 'Baptisé d''eau', 1),
  ('Engagements', 'Baptisé du Saint-Esprit', 2),
  ('Engagements', 'Sert dans une commission', 3)
) as v(groupe, libelle, ordre) on v.groupe = g.nom;
```

- [ ] **Step 2 : Appliquer la migration**

Positionner le jeton sans jamais l'afficher :
`$env:SUPABASE_ACCESS_TOKEN = ((Get-Content .env.local | Select-String '^SUPABASE_ACCESS_TOKEN=') -split '=',2)[1]`

Run : `npx supabase db push`
Expected : appliquée sans erreur.

- [ ] **Step 3 : Vérifier le contenu et le refus anonyme**

L'API Management de Supabase renvoie 403 : passer par PostgREST.

```bash
SVC=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
curl -s "https://zytkgsavvfuubutopzxb.supabase.co/rest/v1/statuts?select=libelle,groupes_statut(nom,exclusif)&order=libelle" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC"
```
Expected : cinq statuts, dont deux rattachés au groupe `Cheminement` marqué `exclusif: true`.

Puis, avec la clé **anonyme**, une lecture et une insertion doivent être refusées en HTTP 401
avec le code Postgres `42501`. **Si l'une des deux réussissait, arrêter et renvoyer BLOCKED.**

- [ ] **Step 4 : Vérifier que les suites existantes passent**

Run : `npm run test:rls` (22 tests), `npm test` (37 tests).
Expected : les deux passent.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260813100000_statuts.sql
git commit -m "feat: creer le catalogue des statuts et ses politiques de lecture"
```

---

### Task 2 : Attribution, journal, et garde d'exclusivité

C'est la tâche la plus délicate du plan. L'attribution d'un statut peut évincer un statut
exclusif : deux écritures et deux entrées de journal qui doivent réussir ou échouer **ensemble**.

**Files:**
- Create: `supabase/migrations/20260813110000_membre_statuts.sql`

**Interfaces:**
- Consumes: `membres` (phase 1a), `statuts` et `groupes_statut` (Task 1)
- Produces:
  - tables `public.membre_statuts` et `public.journal_statuts`
  - `prive.attribuer_statut(p_membre uuid, p_statut uuid, p_date date, p_note text, p_par uuid)` → `void`
  - `prive.retirer_statut(p_membre uuid, p_statut uuid, p_par uuid, p_motif text)` → `void`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260813110000_membre_statuts.sql` :

```sql
-- Attribution des statuts et journal des mouvements (spec §4.3, décision D7).

create type public.action_statut as enum ('ajout', 'retrait');

create table public.membre_statuts (
  membre_id uuid not null references public.membres (id) on delete cascade,
  statut_id uuid not null references public.statuts (id) on delete restrict,
  date_acquisition date,
  note text,
  attribue_par uuid references public.profils (id) on delete set null,
  attribue_le timestamptz not null default now(),
  primary key (membre_id, statut_id)
);

comment on column public.membre_statuts.date_acquisition is
  'Date à laquelle le membre a acquis ce statut. Facultative : elle n''est pas toujours connue.';

-- membre_id est en tête de la clé primaire composite : déjà indexé.
create index membre_statuts_statut_id_idx on public.membre_statuts (statut_id);
create index membre_statuts_attribue_par_idx on public.membre_statuts (attribue_par);

create table public.journal_statuts (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references public.membres (id) on delete cascade,
  statut_id uuid not null references public.statuts (id) on delete restrict,
  action public.action_statut not null,
  par_profil_id uuid references public.profils (id) on delete set null,
  le timestamptz not null default now(),
  motif text
);

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut. En insertion seule : c''est le seul garde-fou aux modifications directes (spec §5.2).';

create index journal_statuts_membre_id_idx on public.journal_statuts (membre_id, le desc);
create index journal_statuts_statut_id_idx on public.journal_statuts (statut_id);
create index journal_statuts_par_profil_id_idx on public.journal_statuts (par_profil_id);

revoke all on public.membre_statuts from anon, authenticated;
revoke all on public.journal_statuts from anon, authenticated;
grant select on public.membre_statuts to authenticated;
grant select on public.journal_statuts to authenticated;

alter table public.membre_statuts enable row level security;
alter table public.membre_statuts force row level security;
alter table public.journal_statuts enable row level security;
alter table public.journal_statuts force row level security;

-- Lecture alignée sur celle des membres : ce qui est visible d'une fiche l'est de ses statuts.
create policy membre_statuts_lecture on public.membre_statuts
  for select to authenticated
  using (
    (select prive.est_actif())
    and exists (
      select 1 from public.membres m
      where m.id = membre_statuts.membre_id
        and (m.etat = 'actif' or (select prive.est_admin()))
    )
  );

create policy journal_statuts_lecture on public.journal_statuts
  for select to authenticated
  using (
    (select prive.est_actif())
    and exists (
      select 1 from public.membres m
      where m.id = journal_statuts.membre_id
        and (m.etat = 'actif' or (select prive.est_admin()))
    )
  );

-- Garde d'invariant : refuse un second statut d'un groupe exclusif.
-- Les fonctions d'attribution évincent le précédent avant d'insérer, donc ce
-- déclencheur ne se déclenche jamais sur le chemin normal. Il existe pour que
-- l'invariant tienne même si quelqu'un écrit un jour directement dans la table.
create or replace function prive.refuser_statut_exclusif_double()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
begin
  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = new.statut_id;

  if v_exclusif and exists (
    select 1
    from public.membre_statuts ms
    join public.statuts s2 on s2.id = ms.statut_id
    where ms.membre_id = new.membre_id
      and s2.groupe_id = v_groupe
      and ms.statut_id <> new.statut_id
  ) then
    raise exception 'Ce membre porte déjà un statut du groupe exclusif concerné.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger membre_statuts_exclusivite
  before insert on public.membre_statuts
  for each row execute function prive.refuser_statut_exclusif_double();

-- Attribution : évince le statut exclusif concurrent, pose le nouveau, journalise
-- les deux mouvements. Une fonction plutôt que deux appels applicatifs, pour que
-- l'ensemble soit atomique : retirer un statut sans réussir à poser le suivant
-- laisserait la fiche dans un état que personne n'a demandé.
create or replace function prive.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
  v_evince uuid;
begin
  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = p_statut and s.actif;

  if v_groupe is null then
    raise exception 'Statut inconnu ou désactivé.' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from public.membres m where m.id = p_membre) then
    raise exception 'Membre inconnu.' using errcode = 'no_data_found';
  end if;

  if v_exclusif then
    for v_evince in
      select ms.statut_id
      from public.membre_statuts ms
      join public.statuts s2 on s2.id = ms.statut_id
      where ms.membre_id = p_membre and s2.groupe_id = v_groupe and ms.statut_id <> p_statut
    loop
      delete from public.membre_statuts
      where membre_id = p_membre and statut_id = v_evince;

      insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
      values (p_membre, v_evince, 'retrait', p_par, 'Remplacé par un autre statut du même groupe');
    end loop;
  end if;

  insert into public.membre_statuts (membre_id, statut_id, date_acquisition, note, attribue_par)
  values (p_membre, p_statut, p_date, nullif(trim(coalesce(p_note, '')), ''), p_par)
  on conflict (membre_id, statut_id) do update
    set date_acquisition = excluded.date_acquisition,
        note = excluded.note,
        attribue_par = excluded.attribue_par,
        attribue_le = now();

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id)
  values (p_membre, p_statut, 'ajout', p_par);
end;
$$;

create or replace function prive.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supprimees integer;
begin
  delete from public.membre_statuts
  where membre_id = p_membre and statut_id = p_statut;

  get diagnostics v_supprimees = row_count;
  if v_supprimees = 0 then
    -- Un retrait sans effet ne doit pas passer pour un succès.
    raise exception 'Ce membre ne porte pas ce statut.' using errcode = 'no_data_found';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
  values (p_membre, p_statut, 'retrait', p_par, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

-- Ces fonctions écrivent : seule la clé de service peut les appeler, et les Server
-- Actions qui l'emploient traversent toutes `exigerAdministrateur` en amont.
revoke execute on function prive.attribuer_statut(uuid, uuid, date, text, uuid) from public, anon, authenticated;
revoke execute on function prive.retirer_statut(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function prive.attribuer_statut(uuid, uuid, date, text, uuid) to service_role;
grant execute on function prive.retirer_statut(uuid, uuid, uuid, text) to service_role;
```

- [ ] **Step 2 : Ouvrir un point d'appel dans le schéma public**

Les fonctions vivent dans `prive`, qui n'est **pas** exposé par l'API — et ne doit pas l'être :
c'est là que vivent `est_actif` et `est_admin`, et les rendre atteignables de l'extérieur
annulerait la raison d'être de ce schéma. On ajoute donc une passerelle mince dans `public`,
dont l'exécution reste réservée à la clé de service.

Créer une **nouvelle** migration `supabase/migrations/20260813120000_passerelles_statuts.sql` —
et non compléter la précédente, qui est déjà appliquée. `supabase db push` suit les migrations
par version et non par contenu : modifier un fichier appliqué ne rejoue rien, et laisse le
dépôt en désaccord silencieux avec la base.

```sql
-- Passerelles appelables par l'API. Le schéma `prive` n'est pas exposé par PostgREST,
-- et ne doit pas l'être : il contient les fonctions de sécurité du projet. Ces deux
-- passerelles donnent à l'application un point d'entrée dans `public`, sans rien
-- ouvrir d'autre — leur exécution est retirée à tous les rôles sauf `service_role`,
-- que seules les Server Actions emploient, derrière `exigerAdministrateur`.

create or replace function public.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  select prive.attribuer_statut(p_membre, p_statut, p_date, p_note, p_par);
$$;

create or replace function public.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select prive.retirer_statut(p_membre, p_statut, p_par, p_motif);
$$;

revoke execute on function public.attribuer_statut(uuid, uuid, date, text, uuid) from public, anon, authenticated;
revoke execute on function public.retirer_statut(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attribuer_statut(uuid, uuid, date, text, uuid) to service_role;
grant execute on function public.retirer_statut(uuid, uuid, uuid, text) to service_role;
```

- [ ] **Step 3 : Appliquer la migration**

Run : `npx supabase db push`
Expected : appliquée sans erreur.

**Vérifie immédiatement que les passerelles sont bien fermées** : avec la clé **anonyme**, un
appel `POST /rest/v1/rpc/attribuer_statut` doit être refusé. **S'il réussissait, arrête-toi et
renvoie BLOCKED** — ce serait une écriture ouverte à quiconque.

- [ ] **Step 4 : Éprouver l'atomicité et l'exclusivité, en réel**

C'est le cœur de la tâche : ces fonctions doivent être exercées, pas seulement lues.
Crée un membre temporaire avec la clé de service, puis, en appelant les fonctions par RPC :

```bash
SVC=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
B=https://zytkgsavvfuubutopzxb.supabase.co
# attribuer « Non-croyant » puis « Repenti » — même groupe exclusif
curl -s -X POST "$B/rest/v1/rpc/attribuer_statut" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
  -H 'Content-Type: application/json' -H 'Content-Profile: prive' \
  -d '{"p_membre":"<ID>","p_statut":"<ID_NON_CROYANT>","p_date":null,"p_note":null,"p_par":null}'
```

Vérifie ensuite, en lisant les tables :
1. après les deux attributions, le membre ne porte **que** « Repenti » ;
2. le journal contient **trois** entrées : ajout, retrait, ajout ;
3. attribuer un statut du groupe non exclusif ne retire rien ;
4. `retirer_statut` sur un statut que le membre ne porte pas **échoue** au lieu de ne rien faire.

Reporte les quatre sorties verbatim. Supprime ensuite le membre temporaire et confirme que
`membres`, `membre_statuts` et `journal_statuts` sont revenus à leur état initial.

Si l'appel RPC échoue à cause du schéma `prive`, essaie sans l'en-tête `Content-Profile` en
exposant temporairement la fonction autrement — **et si tu ne parviens pas à l'appeler, ne
contourne pas** : décris ce que tu observes et renvoie DONE_WITH_CONCERNS. La tâche suivante
dépend de ce chemin d'appel.

- [ ] **Step 5 : Durcissement issu de la revue**

Quatre défauts ont été trouvés par la revue de cette tâche, dont deux critiques. Créer
`supabase/migrations/20260813130000_durcir_statuts.sql` :

```sql
-- Durcissement issu de la revue de la Task 2. Migration séparée : les précédentes
-- sont déjà appliquées et ne se réécrivent pas.

-- 1. Le journal ne se réécrit pas.
--    Le commentaire de la table promettait « en insertion seule » sans que rien ne
--    l'impose : la trace était modifiable par la clé de service, c'est-à-dire par le
--    seul chemin d'écriture de l'application.
create or replace function prive.refuser_reecriture_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Le journal des statuts ne se réécrit pas.';
end;
$$;

create trigger journal_statuts_sans_reecriture
  before update on public.journal_statuts
  for each row execute function prive.refuser_reecriture_journal();

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut, protégée contre la réécriture par un déclencheur : aucune modification n''est possible, par personne. La suppression reste possible en cascade avec le membre — seule voie d''effacement complet d''une personne. L''application, elle, archive et ne supprime jamais.';

-- 2. Le garde d'exclusivité couvre aussi les modifications.
--    Il ne portait que sur `insert` : un `update` changeant `statut_id` pour un autre
--    statut du même groupe exclusif passait sans aucun contrôle, alors que le
--    commentaire promettait que l'invariant tenait pour toute écriture directe.
drop trigger if exists membre_statuts_exclusivite on public.membre_statuts;
create trigger membre_statuts_exclusivite
  before insert or update on public.membre_statuts
  for each row execute function prive.refuser_statut_exclusif_double();

-- 3. Attribution : verrou de concurrence, pas d'écrasement, journal fidèle.
create or replace function prive.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
  v_evince uuid;
  v_nouveau boolean;
begin
  -- `for update` verrouille la ligne du membre pour la durée de la transaction.
  -- Sans ce verrou, deux attributions simultanées de deux statuts d'un même groupe
  -- exclusif réussiraient toutes les deux : aucune ne voit l'insertion non validée
  -- de l'autre, leurs clés primaires diffèrent, et le déclencheur ne voit rien. Le
  -- membre porterait alors deux statuts qui s'excluent, sans la moindre erreur.
  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.';
  end if;

  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = p_statut and s.actif;

  if v_groupe is null then
    raise exception 'Statut inconnu ou désactivé.';
  end if;

  if v_exclusif then
    for v_evince in
      select ms.statut_id
      from public.membre_statuts ms
      join public.statuts s2 on s2.id = ms.statut_id
      where ms.membre_id = p_membre and s2.groupe_id = v_groupe and ms.statut_id <> p_statut
    loop
      delete from public.membre_statuts
      where membre_id = p_membre and statut_id = v_evince;

      insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
      values (p_membre, v_evince, 'retrait', p_par, 'Remplacé par un autre statut du même groupe');
    end loop;
  end if;

  -- `coalesce` plutôt qu'écrasement : réattribuer un statut déjà porté sans
  -- renseigner de date effacerait la date d'acquisition existante — une information
  -- qu'on ne retrouve pas. Une valeur fournie remplace, une valeur absente laisse.
  insert into public.membre_statuts (membre_id, statut_id, date_acquisition, note, attribue_par)
  values (p_membre, p_statut, p_date, nullif(trim(coalesce(p_note, '')), ''), p_par)
  on conflict (membre_id, statut_id) do update
    set date_acquisition = coalesce(excluded.date_acquisition, membre_statuts.date_acquisition),
        note = coalesce(excluded.note, membre_statuts.note),
        attribue_par = excluded.attribue_par,
        attribue_le = now()
  returning (xmax = 0) into v_nouveau;

  -- Journaliser un « ajout » alors que le statut était déjà porté ferait mentir le
  -- journal sur ce qui s'est réellement passé.
  if v_nouveau then
    insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id)
    values (p_membre, p_statut, 'ajout', p_par);
  end if;
end;
$$;

-- 4. Retrait : une erreur d'usage doit sortir en 400, pas en 500.
--    `no_data_found` était traduit en erreur serveur par PostgREST, alors que
--    « ce membre ne porte pas ce statut » est une condition ordinaire.
create or replace function prive.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supprimees integer;
begin
  delete from public.membre_statuts
  where membre_id = p_membre and statut_id = p_statut;

  get diagnostics v_supprimees = row_count;
  if v_supprimees = 0 then
    -- Un retrait sans effet ne doit pas passer pour un succès.
    raise exception 'Ce membre ne porte pas ce statut.';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
  values (p_membre, p_statut, 'retrait', p_par, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

-- 5. Commentaires : dire ce que les objets font réellement.
comment on function prive.refuser_statut_exclusif_double() is
  'Garde d''invariant sur membre_statuts. Il s''exécute à chaque insertion et modification, et ne lève que si le membre porterait deux statuts d''un même groupe exclusif. Les fonctions d''attribution évinçant le concurrent avant d''insérer, il ne lève jamais sur le chemin normal.';

comment on function public.attribuer_statut(uuid, uuid, date, text, uuid) is
  'Passerelle appelable par l''API vers prive.attribuer_statut. Exécution réservée à service_role : le schéma prive n''est pas exposé et ne doit pas l''être.';

comment on function public.retirer_statut(uuid, uuid, uuid, text) is
  'Passerelle appelable par l''API vers prive.retirer_statut. Exécution réservée à service_role.';
```

- [ ] **Step 6 : Vérifier les suites existantes**

Run : `npm run test:rls` (22 tests), `npm test` (37 tests).

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/20260813110000_membre_statuts.sql
git commit -m "feat: attribuer et retirer des statuts de maniere atomique et journalisee"
```

---

### Task 3 : Règles de statut (domaine pur)

**Files:**
- Create: `src/lib/domaine/statut.ts`
- Create: `src/lib/domaine/statut.test.ts`

**Interfaces:**
- Consumes: rien
- Produits:
  - `class StatutInvalideError extends Error`
  - `normaliserDateAcquisition(brut: unknown): string | null` — `AAAA-MM-JJ` ou `null`
  - `normaliserNote(brut: unknown): string | null`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/lib/domaine/statut.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from './statut'

describe('normaliserDateAcquisition', () => {
  it('accepte une date au format du formulaire', () => {
    expect(normaliserDateAcquisition('2025-03-12')).toBe('2025-03-12')
  })

  it('traite une valeur absente comme non renseignée', () => {
    expect(normaliserDateAcquisition(null)).toBeNull()
    expect(normaliserDateAcquisition(undefined)).toBeNull()
    expect(normaliserDateAcquisition('')).toBeNull()
    expect(normaliserDateAcquisition('   ')).toBeNull()
  })

  it('refuse une date mal formée', () => {
    expect(() => normaliserDateAcquisition('12/03/2025')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('2025-3-12')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('hier')).toThrow(StatutInvalideError)
  })

  it('refuse une date inexistante au calendrier', () => {
    expect(() => normaliserDateAcquisition('2025-02-30')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('2025-13-01')).toThrow(StatutInvalideError)
  })

  it('refuse une date dans le futur', () => {
    const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(() => normaliserDateAcquisition(demain)).toThrow(StatutInvalideError)
  })

  it("accepte aujourd'hui", () => {
    const aujourdhui = new Date().toISOString().slice(0, 10)
    expect(normaliserDateAcquisition(aujourdhui)).toBe(aujourdhui)
  })

  it("refuse une valeur qui n'est pas du texte plutôt que de la perdre", () => {
    expect(() => normaliserDateAcquisition(20250312)).toThrow(StatutInvalideError)
  })
})

describe('normaliserNote', () => {
  it('retire les espaces superflus', () => {
    expect(normaliserNote('  Baptisé à Yaoundé  ')).toBe('Baptisé à Yaoundé')
  })

  it('traite une note vide comme absente', () => {
    expect(normaliserNote('')).toBeNull()
    expect(normaliserNote('   ')).toBeNull()
    expect(normaliserNote(null)).toBeNull()
  })

  it("refuse une valeur qui n'est pas du texte", () => {
    expect(() => normaliserNote(42)).toThrow(StatutInvalideError)
  })

  it('refuse une note démesurée', () => {
    expect(() => normaliserNote('x'.repeat(501))).toThrow(StatutInvalideError)
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run : `npm test`
Expected : FAIL — `Failed to resolve import "./statut"`.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/lib/domaine/statut.ts` :

```typescript
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/
const LONGUEUR_NOTE_MAXIMALE = 500

export class StatutInvalideError extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = 'StatutInvalideError'
  }
}

function texteOuNull(brut: unknown, champ: string): string | null {
  if (brut === null || brut === undefined) return null
  if (typeof brut !== 'string') {
    throw new StatutInvalideError(`Le champ « ${champ} » a reçu une valeur inattendue.`)
  }
  const nettoye = brut.trim()
  return nettoye.length === 0 ? null : nettoye
}

/**
 * Date d'acquisition au format `AAAA-MM-JJ`, ou `null` si non renseignée.
 *
 * Une date future est refusée : un statut se constate, il ne se planifie pas.
 * Une date inexistante au calendrier l'est aussi — `2025-02-30` passerait une
 * simple vérification de forme et deviendrait une autre date en base.
 */
export function normaliserDateAcquisition(brut: unknown): string | null {
  const valeur = texteOuNull(brut, "date d'acquisition")
  if (valeur === null) return null

  if (!FORMAT_DATE.test(valeur)) {
    throw new StatutInvalideError("La date doit être au format AAAA-MM-JJ.")
  }

  const [annee, mois, jour] = valeur.split('-').map(Number)
  const date = new Date(Date.UTC(annee, mois - 1, jour))
  const existe =
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  if (!existe) {
    throw new StatutInvalideError("Cette date n'existe pas au calendrier.")
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (valeur > aujourdhui) {
    throw new StatutInvalideError("La date d'acquisition ne peut pas être dans le futur.")
  }

  return valeur
}

/** Note libre accompagnant un statut, ou `null`. */
export function normaliserNote(brut: unknown): string | null {
  const valeur = texteOuNull(brut, 'note')
  if (valeur !== null && valeur.length > LONGUEUR_NOTE_MAXIMALE) {
    throw new StatutInvalideError(
      `La note ne doit pas dépasser ${LONGUEUR_NOTE_MAXIMALE} caractères.`,
    )
  }
  return valeur
}
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run : `npm test`
Expected : PASS. Rapporte le **compte réel** — il devrait passer de 37 à 48 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/domaine/statut.ts src/lib/domaine/statut.test.ts
git commit -m "feat: valider les dates d'acquisition et les notes de statut"
```

---

### Task 4 : Lectures typées des statuts

**Files:**
- Create: `src/lib/donnees/statuts.ts`

**Interfaces:**
- Consumes: `clientServeur` (phase 0)
- Produces:
  - `type GroupeStatut = { id: string; nom: string; exclusif: boolean; statuts: StatutCatalogue[] }`
  - `type StatutCatalogue = { id: string; libelle: string; actif: boolean }`
  - `type StatutDuMembre = { statutId: string; libelle: string; groupeNom: string; dateAcquisition: string | null; note: string | null }`
  - `type EntreeJournal = { id: string; libelle: string; action: 'ajout' | 'retrait'; le: string; parNomAffichage: string | null; motif: string | null }`
  - `listerCatalogue(inclureInactifs?: boolean): Promise<GroupeStatut[]>`
  - `statutsDuMembre(membreId: string): Promise<StatutDuMembre[]>`
  - `journalDuMembre(membreId: string): Promise<EntreeJournal[]>`

- [ ] **Step 1 : Écrire le module**

Créer `src/lib/donnees/statuts.ts` :

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type StatutCatalogue = { id: string; libelle: string; actif: boolean }
export type GroupeStatut = {
  id: string
  nom: string
  exclusif: boolean
  statuts: StatutCatalogue[]
}
export type StatutDuMembre = {
  statutId: string
  libelle: string
  groupeNom: string
  dateAcquisition: string | null
  note: string | null
}
export type EntreeJournal = {
  id: string
  libelle: string
  action: 'ajout' | 'retrait'
  le: string
  parNomAffichage: string | null
  motif: string | null
}

/**
 * PostgREST renvoie un OBJET pour une ressource imbriquée en plusieurs-vers-un,
 * mais le client, faute de types `Database` générés, la déclare comme un tableau.
 * Les deux formes se ramènent ici à une seule. Même contournement que `nomAntenne`
 * dans `membres.ts`, généralisé pour trois relations distinctes de ce module
 * (statut et groupe dans `statutsDuMembre`, statut et profil dans
 * `journalDuMembre`), soit quatre appels.
 */
type Imbrique<T> = T | T[] | null | undefined

function premier<T>(valeur: Imbrique<T>): T | null {
  if (valeur === null || valeur === undefined) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

type StatutImbrique = {
  libelle: string
  groupes_statut: Imbrique<{ nom: string; ordre: number }>
}

/**
 * Catalogue groupé, trié. `inclureInactifs` sert l'écran d'administration : sans
 * lui, un statut désactivé disparaîtrait de l'interface sans retour possible —
 * l'impasse déjà rencontrée avec les antennes en phase 1a.
 */
export async function listerCatalogue(inclureInactifs = false): Promise<GroupeStatut[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('groupes_statut')
    .select('id, nom, exclusif, ordre, statuts(id, libelle, actif, ordre)')
    .order('ordre')

  if (error) {
    throw new Error(`Lecture du catalogue impossible : ${error.message}`)
  }

  return (data ?? []).map((g) => ({
    id: g.id as string,
    nom: g.nom as string,
    exclusif: g.exclusif as boolean,
    statuts: ((g.statuts ?? []) as Array<Record<string, unknown>>)
      .filter((s) => inclureInactifs || s.actif === true)
      .sort((a, b) => Number(a.ordre) - Number(b.ordre))
      .map((s) => ({ id: s.id as string, libelle: s.libelle as string, actif: s.actif as boolean })),
  }))
}

/** Statuts portés par un membre, triés par groupe puis par libellé. */
export async function statutsDuMembre(membreId: string): Promise<StatutDuMembre[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membre_statuts')
    .select('statut_id, date_acquisition, note, statuts(libelle, groupes_statut(nom, ordre))')
    .eq('membre_id', membreId)

  if (error) {
    throw new Error(`Lecture des statuts impossible : ${error.message}`)
  }

  // L'ordre du groupe sert au tri mais ne sort pas d'ici : on le porte à côté de la
  // ligne plutôt que dedans, pour n'avoir ensuite rien à en retirer.
  return (data ?? [])
    .map((l) => {
      const statutId = l.statut_id as string
      const statut = premier(l.statuts as Imbrique<StatutImbrique>)
      // `statuts.id` est référencé par `membre_statuts.statut_id` en `on delete
      // restrict`, et la politique de lecture de `statuts` n'exige que `est_actif()`
      // — comme celle de `membre_statuts`. Si la ligne a pu être lue, le statut est
      // forcément lisible aussi : un `statut` absent ici n'est pas une donnée
      // manquante, c'est une jointure cassée. La déguiser en « — » masquerait le
      // défaut au lieu de le signaler.
      if (!statut) {
        throw new Error(
          `Jointure incomplète : le statut ${statutId} référencé par membre_statuts est introuvable.`,
        )
      }
      const groupe = premier(statut.groupes_statut)
      // Même raisonnement : `statuts.groupe_id` est `not null` et référence
      // `groupes_statut` en `on delete restrict`, sous la même politique de lecture.
      if (!groupe) {
        throw new Error(
          `Jointure incomplète : le groupe du statut ${statutId} est introuvable.`,
        )
      }
      return {
        ordreGroupe: groupe.ordre,
        ligne: {
          statutId,
          libelle: statut.libelle,
          groupeNom: groupe.nom,
          dateAcquisition: l.date_acquisition as string | null,
          note: l.note as string | null,
        },
      }
    })
    .sort(
      (a, b) =>
        a.ordreGroupe - b.ordreGroupe || a.ligne.libelle.localeCompare(b.ligne.libelle, 'fr'),
    )
    .map(({ ligne }) => ligne)
}

/** Journal d'un membre, du plus récent au plus ancien. */
export async function journalDuMembre(membreId: string): Promise<EntreeJournal[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('journal_statuts')
    .select('id, action, le, motif, statuts(libelle), profils(nom_affichage)')
    .eq('membre_id', membreId)
    .order('le', { ascending: false })

  if (error) {
    throw new Error(`Lecture du journal impossible : ${error.message}`)
  }

  return (data ?? []).map((l) => {
    const id = l.id as string
    const statut = premier(l.statuts as Imbrique<{ libelle: string }>)
    // `journal_statuts.statut_id` référence `statuts` en `on delete restrict`, sous
    // la même politique de lecture que `journal_statuts` : un statut absent ici est
    // une jointure cassée, pas une entrée sans statut légitime.
    if (!statut) {
      throw new Error(`Jointure incomplète : le statut de l'entrée de journal ${id} est introuvable.`)
    }
    // `par_profil_id`, lui, est en `on delete set null` : un auteur supprimé est un
    // cas réel et attendu. Le repli à `null` reste donc correct ici, sans lever.
    const profil = premier(l.profils as Imbrique<{ nom_affichage: string }>)
    return {
      id,
      libelle: statut.libelle,
      action: l.action as 'ajout' | 'retrait',
      le: l.le as string,
      parNomAffichage: profil?.nom_affichage ?? null,
      motif: l.motif as string | null,
    }
  })
}
```

- [ ] **Step 2 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm test`.
Expected : les trois passent.

- [ ] **Step 2 bis : Éprouver les requêtes contre la vraie base**

Les trois vérifications ci-dessus ne prouvent que la compilation. Un nom de colonne
faux ou une jointure ambiguë vit dans une **chaîne de caractères** : ni `tsc`, ni
ESLint, ni les tests unitaires ne peuvent les voir. Sans cette étape, une requête
cassée ne se découvrirait qu'à la Task 6, trois tâches plus loin.

Ces fonctions appellent `clientServeur()`, qui exige un contexte de requête Next :
on ne peut pas les appeler directement depuis un script. On éprouve donc les
**requêtes elles-mêmes**, à l'identique, avec la clé de service.

Crée un fichier temporaire hors du dépôt (pas dans le répertoire de travail) :

```javascript
import { createClient } from '@supabase/supabase-js'

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Les trois `select` sont copiés MOT POUR MOT depuis src/lib/donnees/statuts.ts.
// Les recopier de mémoire ne prouverait rien sur le code réellement livré.
//
// Ceux ci-dessous sont une copie datée : le module fait autorité, pas ce bloc.
// Ils ont DÉJÀ divergé une fois — `statuts(id, libelle, actif)` ici contre
// `statuts(id, libelle, actif, ordre)` dans le module, si bien que ce contrôle
// aurait affiché OK sans jamais éprouver `ordre`, la clé de tri. Ouvre le fichier
// et compare avant de lancer : un contrôle qui éprouve autre chose que ce qu'on
// livre est pire qu'un contrôle absent, parce qu'il rassure.
const requetes = {
  catalogue: c
    .from('groupes_statut')
    .select('id, nom, exclusif, ordre, statuts(id, libelle, actif, ordre)'),
  statutsDuMembre: c
    .from('membre_statuts')
    .select('statut_id, date_acquisition, note, statuts(libelle, groupes_statut(nom, ordre))')
    .limit(1),
  journal: c
    .from('journal_statuts')
    .select('id, action, le, motif, statuts(libelle), profils(nom_affichage)')
    .limit(1),
}

for (const [nom, requete] of Object.entries(requetes)) {
  const { error } = await requete
  console.log(error ? `${nom} : ECHEC — ${error.code} ${error.message}` : `${nom} : OK`)
}
```

Run : `node --env-file=.env.local <chemin-du-fichier-temporaire>`
Expected : les trois lignes affichent `OK`.

Si l'une échoue, le défaut est dans la requête du module, pas dans le script :
corrige `src/lib/donnees/statuts.ts` et relance. Un `42703` désigne une colonne
inexistante, un `PGRST200` une jointure que PostgREST ne sait pas résoudre.

Supprime le fichier temporaire, puis vérifie qu'il n'apparaît pas dans
`git status`.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/donnees/statuts.ts
git commit -m "feat: lire le catalogue, les statuts d'un membre et son journal"
```

---

### Task 5 : Actions d'attribution et de retrait

**Files:**
- Create: `src/app/membres/[id]/statuts/actions.ts`
- Create: `src/app/membres/[id]/statuts/messages.ts`

**Interfaces:**
- Consumes: `exigerAdministrateur` (phase 1a), `clientAdmin` (phase 0), `normaliserDateAcquisition` et `normaliserNote` (Task 3), les fonctions Postgres de la Task 2
- Produces:
  - `type EtatStatut = { erreur: string | null }`
  - `attribuerStatut(etat: EtatStatut, donnees: FormData): Promise<EtatStatut>`
  - `retirerStatut(donnees: FormData): Promise<void>`

- [ ] **Step 1 : Écrire les messages**

Créer `src/app/membres/[id]/statuts/messages.ts` :

```typescript
export const MESSAGE_ECHEC_STATUT =
  "Le statut n'a pas pu être enregistré. Vérifiez les informations saisies."
```

- [ ] **Step 2 : Écrire les actions**

Créer `src/app/membres/[id]/statuts/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from '@/lib/domaine/statut'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_STATUT } from './messages'

export type EtatStatut = { erreur: string | null }

function texteObligatoire(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

export async function attribuerStatut(
  _etat: EtatStatut,
  donnees: FormData,
): Promise<EtatStatut> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  let dateAcquisition: string | null
  let note: string | null
  try {
    dateAcquisition = normaliserDateAcquisition(donnees.get('dateAcquisition'))
    note = normaliserNote(donnees.get('note'))
  } catch (erreur) {
    return {
      erreur: erreur instanceof StatutInvalideError ? erreur.message : MESSAGE_ECHEC_STATUT,
    }
  }

  // L'attribution peut évincer un statut exclusif et doit journaliser les deux
  // mouvements : c'est une fonction Postgres, donc atomique. Deux appels séparés
  // laisseraient la fiche sans statut si le second échouait.
  const { error } = await clientAdmin()
    .rpc('attribuer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_date: dateAcquisition,
      p_note: note,
      p_par: profil.id,
    })

  if (error) {
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}

export async function retirerStatut(donnees: FormData): Promise<void> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    redirect('/membres')
  }

  // La fonction lève si le membre ne porte pas ce statut : un retrait sans effet
  // ne doit pas passer pour un succès.
  const { error } = await clientAdmin()
    .rpc('retirer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_par: profil.id,
      p_motif: normaliserNote(donnees.get('motif')),
    })

  if (error) {
    throw new Error(`Le statut n'a pas pu être retiré : ${error.message}`)
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
Expected : les quatre passent. Le dernier révélerait une constante restée dans un fichier
`'use server'`.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/membres/[id]/statuts/actions.ts" "src/app/membres/[id]/statuts/messages.ts"
git commit -m "feat: attribuer et retirer un statut depuis l'application"
```

---

### Task 6 : Écran des statuts d'un membre

**Files:**
- Create: `src/app/membres/[id]/statuts/formulaire-statut.tsx`
- Create: `src/app/membres/[id]/statuts/bouton-retirer-statut.tsx`
- Create: `src/app/membres/[id]/statuts/page.tsx`

**Interfaces:**
- Consumes: `exigerProfilActif` et `rolesDuProfil` (phase 1a), `membreParId` (phase 1a), `listerCatalogue`, `statutsDuMembre`, `journalDuMembre` (Task 4), `attribuerStatut` et `retirerStatut` (Task 5)
- Produces: la route `/membres/[id]/statuts`

- [ ] **Step 1 : Écrire le formulaire d'attribution**

Créer `src/app/membres/[id]/statuts/formulaire-statut.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { attribuerStatut, type EtatStatut } from './actions'

const etatInitial: EtatStatut = { erreur: null }

export function FormulaireStatut({
  membreId,
  groupes,
}: {
  membreId: string
  groupes: GroupeStatut[]
}) {
  const [etat, envoyer, enCours] = useActionState(attribuerStatut, etatInitial)
  const aujourdhui = new Date().toISOString().slice(0, 10)

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="membreId" value={membreId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Statut (obligatoire)</span>
        <select
          name="statutId"
          required
          defaultValue=""
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="" disabled>
            Choisir un statut…
          </option>
          {groupes.map((groupe) => (
            <optgroup
              key={groupe.id}
              label={groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom}
            >
              {groupe.statuts.map((statut) => (
                <option key={statut.id} value={statut.id}>
                  {statut.libelle}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Date d&apos;acquisition</span>
        <input
          name="dateAcquisition"
          type="date"
          max={aujourdhui}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span className="text-xs text-neutral-500">
          Facultative. Elle n&apos;est pas toujours connue. Sur un statut déjà porté,
          laisser vide conserve la date enregistrée.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Note</span>
        <input
          name="note"
          maxLength={500}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        {/*
          Cette mention n'est pas un ornement. `attribuer_statut` applique un
          `coalesce` : sur un statut déjà porté, un champ vide veut dire « ne change
          pas », jamais « efface ». Sans cette phrase, un administrateur qui vide la
          note pour la supprimer verrait une redirection de succès et retrouverait
          l'ancienne note intacte, sans le moindre avertissement.
        */}
        <span className="text-xs text-neutral-500">
          Facultative. Sur un statut déjà porté, laisser vide conserve la note
          enregistrée.
        </span>
      </label>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Enregistrement…' : 'Attribuer ce statut'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2 : Écrire le bouton de retrait**

Créer `src/app/membres/[id]/statuts/bouton-retirer-statut.tsx` :

```tsx
'use client'

export function BoutonRetirerStatut({ libelle }: { libelle: string }) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const confirme = window.confirm(
          `Retirer le statut « ${libelle} » ?\n\n` +
            'Le retrait est enregistré au journal et reste consultable ; le statut ' +
            'pourra être réattribué.',
        )
        if (!confirme) {
          evenement.preventDefault()
        }
      }}
      className="text-sm text-red-600 underline underline-offset-4"
    >
      Retirer
    </button>
  )
}
```

- [ ] **Step 3 : Écrire l'écran**

Créer `src/app/membres/[id]/statuts/page.tsx` :

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { journalDuMembre, listerCatalogue, statutsDuMembre } from '@/lib/donnees/statuts'
import { exigerProfilActif } from '@/lib/securite/garde'
import { retirerStatut } from './actions'
import { BoutonRetirerStatut } from './bouton-retirer-statut'
import { FormulaireStatut } from './formulaire-statut'

const FORMAT_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default async function PageStatuts({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const [statuts, journal, groupes, roles] = await Promise.all([
    statutsDuMembre(membre.id),
    journalDuMembre(membre.id),
    listerCatalogue(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold">
          Statuts de {membre.prenom} {membre.nom}
        </h1>
        {membre.etat !== 'actif' ? (
          <p className="mt-1 text-sm text-amber-700">
            {membre.etat === 'archive'
              ? "Fiche archivée — elle ne figure plus dans l'annuaire."
              : 'Fiche en attente de validation.'}
          </p>
        ) : null}
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-medium">Statuts actuels</h2>
        {statuts.length === 0 ? (
          <p className="text-neutral-600">Aucun statut attribué pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {statuts.map((statut) => (
              <li key={statut.statutId} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{statut.libelle}</p>
                  <p className="text-sm text-neutral-500">
                    {statut.groupeNom}
                    {statut.dateAcquisition ? ` · depuis le ${statut.dateAcquisition}` : ''}
                  </p>
                  {statut.note ? <p className="mt-1 text-sm">{statut.note}</p> : null}
                </div>
                {estAdmin ? (
                  <form action={retirerStatut} className="flex items-start gap-2">
                    <input type="hidden" name="membreId" value={membre.id} />
                    <input type="hidden" name="statutId" value={statut.statutId} />
                    {/*
                      `maxLength` n'est pas décoratif : `retirerStatut` n'a aucun canal
                      pour renvoyer un message de validation, et un motif trop long y
                      serait journalisé puis remplacé par null — le retrait réussirait
                      sans le motif, sans un mot à l'utilisateur. La limite se voit
                      donc au moment où l'on écrit, pas après coup.
                    */}
                    <input
                      type="text"
                      name="motif"
                      maxLength={500}
                      placeholder="Motif du retrait (facultatif)"
                      aria-label={`Motif du retrait du statut « ${statut.libelle} »`}
                      className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <BoutonRetirerStatut libelle={statut.libelle} />
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {estAdmin ? (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-medium">Attribuer un statut</h2>
          <FormulaireStatut membreId={membre.id} groupes={groupes} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-1 text-lg font-medium">Journal</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Chaque mouvement est conservé : c&apos;est la seule trace des modifications.
        </p>
        {journal.length === 0 ? (
          <p className="text-neutral-600">Aucun mouvement enregistré.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {journal.map((entree) => (
              <li key={entree.id} className="py-3 text-sm">
                <span className={entree.action === 'ajout' ? 'text-green-700' : 'text-red-700'}>
                  {entree.action === 'ajout' ? 'Ajouté' : 'Retiré'}
                </span>{' '}
                — {entree.libelle}
                <span className="text-neutral-500">
                  {' '}
                  · {FORMAT_DATE_HEURE.format(new Date(entree.le))}
                  {entree.parNomAffichage ? ` · par ${entree.parNomAffichage}` : ''}
                </span>
                {entree.motif ? <p className="text-neutral-600">{entree.motif}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 4 : Relier l'écran depuis la fiche membre**

Dans `src/app/membres/[id]/page.tsx`, ajouter dans la barre d'actions un lien visible de **tous**
les comptes actifs — la consultation des statuts n'est pas réservée aux administrateurs :

```tsx
            <Link href={`/membres/${membre.id}/statuts`} className="text-sm underline underline-offset-4">
              Statuts
            </Link>
```

Ce lien doit être placé **hors** du bloc conditionné par `estAdmin`.

- [ ] **Step 5 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Puis, avec un compte administrateur jetable et Playwright, sur un membre de test :
1. la fiche propose un lien « Statuts » ;
2. l'écran affiche « Aucun statut attribué » et un journal vide ;
3. attribuer « Repenti » : il apparaît, le journal montre un ajout ;
4. attribuer « Non-croyant » — **même groupe exclusif** : « Repenti » disparaît, et le journal
   montre trois entrées, dont le retrait automatique avec son motif ;
5. attribuer « Baptisé d'eau » — groupe non exclusif : il s'ajoute **sans** retirer le premier ;
6. retirer un statut demande confirmation ; la refuser ne change rien ;
7. une date d'acquisition dans le futur est refusée avec un message lisible ;
8. retirer un statut **en saisissant un motif** : le motif apparaît au journal, sur la
   ligne du retrait. Vérifie-le à l'écran, puis en base — c'est la seule preuve que le
   champ est bien câblé jusqu'à `journal_statuts.motif` ; un champ qui ne remonte nulle
   part se voit d'autant moins qu'il est facultatif ;
9. retirer un statut **sans** motif : le retrait aboutit, et le journal n'affiche
   simplement pas de motif sur cette ligne. Sans ce cas, rien ne distingue « facultatif »
   de « obligatoire mais jamais testé à vide ».

Supprime ensuite le membre de test et le compte jetable, et confirme que `membres`,
`membre_statuts` et `journal_statuts` sont revenus à leur état initial.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/membres/[id]/statuts" "src/app/membres/[id]/page.tsx"
git commit -m "feat: consulter, attribuer et retirer les statuts d'un membre"
```

---

### Task 7 : Gestion du catalogue par l'administrateur

**Files:**
- Create: `src/app/statuts/actions.ts`
- Create: `src/app/statuts/formulaire-catalogue.tsx`
- Create: `src/app/statuts/bouton-bascule-statut.tsx`
- Create: `src/app/statuts/page.tsx`
- Modify: `src/app/tableau-de-bord/page.tsx` (lien vers le catalogue)

**Interfaces:**
- Consumes: `exigerAdministrateur`, `clientAdmin`, `listerCatalogue` (Task 4)
- Produces:
  - `type EtatCatalogue = { erreur: string | null }`
  - `creerGroupe(etat: EtatCatalogue, donnees: FormData): Promise<EtatCatalogue>`
  - `creerStatut(etat: EtatCatalogue, donnees: FormData): Promise<EtatCatalogue>`
  - `desactiverStatut(donnees: FormData): Promise<void>`
  - `reactiverStatut(donnees: FormData): Promise<void>`

- [ ] **Step 1 : Écrire les actions**

Créer `src/app/statuts/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type EtatCatalogue = { erreur: string | null }

// Code Postgres du unique_violation. On discrimine sur `error.code`, jamais sur le
// texte du message : un doublon réel doit être annoncé franchement, mais tout autre
// échec (panne, identifiant de groupe forgé, violation de clé étrangère) ne doit pas
// laisser croire à un doublon qui n'en est pas un. Même principe que
// `src/app/membres/[id]/statuts/actions.ts`, qui discrimine sur `error.details`.
const CODE_VIOLATION_UNICITE = '23505'

export async function creerGroupe(
  _etat: EtatCatalogue,
  donnees: FormData,
): Promise<EtatCatalogue> {
  await exigerAdministrateur()

  const nom = String(donnees.get('nom') ?? '').trim()
  if (nom.length === 0) {
    return { erreur: 'Le nom du groupe est obligatoire.' }
  }
  const exclusif = donnees.get('exclusif') === 'on'

  const { error } = await clientAdmin().from('groupes_statut').insert({ nom, exclusif })
  if (error) {
    // Trace serveur systématique : un administrateur qui signale « ça ne marche pas »
    // doit trouver quelque chose d'exploitable dans les journaux, pas seulement un
    // message générique à l'écran. Même exigence que pour `attribuerStatut`.
    console.error("creerGroupe : échec de l'insertion", {
      nom,
      exclusif,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: 'Ce groupe existe déjà.' }
    }
    return { erreur: "Le groupe n'a pas pu être créé." }
  }

  revalidatePath('/statuts')
  return { erreur: null }
}

export async function creerStatut(
  _etat: EtatCatalogue,
  donnees: FormData,
): Promise<EtatCatalogue> {
  await exigerAdministrateur()

  const groupeId = String(donnees.get('groupeId') ?? '')
  const libelle = String(donnees.get('libelle') ?? '').trim()
  if (groupeId.length === 0 || libelle.length === 0) {
    return { erreur: 'Le groupe et le libellé sont obligatoires.' }
  }

  const { error } = await clientAdmin()
    .from('statuts')
    .insert({ groupe_id: groupeId, libelle })
  if (error) {
    console.error("creerStatut : échec de l'insertion", {
      groupeId,
      libelle,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: 'Ce statut existe déjà dans ce groupe.' }
    }
    return { erreur: "Le statut n'a pas pu être créé." }
  }

  revalidatePath('/statuts')
  // Les écrans qui AFFICHENT un libellé de statut sont les fiches membres et leurs
  // écrans de statuts, pas l'annuaire — celui-ci ne montre aucun statut. Le `type`
  // est obligatoire sur un segment dynamique, et `/membres/[id]` n'invalide PAS
  // `/membres/[id]/statuts` : chacun se déclare.
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/membres/[id]/statuts', 'page')
  return { erreur: null }
}

export async function desactiverStatut(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerStatut(donnees, false)
}

/** Sans elle, désactiver un statut par erreur serait sans retour depuis l'interface. */
export async function reactiverStatut(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerStatut(donnees, true)
}

async function basculerStatut(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    // Champ caché absent : atteignable seulement par une requête forgée, jamais par
    // l'interface. Le risque est donc faible, mais on journalise quand même — un cas
    // qui ne devrait jamais arriver et qui arrive est un symptôme. Même raisonnement
    // que `attribuerStatut`/`retirerStatut` dans
    // `src/app/membres/[id]/statuts/actions.ts`.
    console.error('basculerStatut : identifiant manquant dans le formulaire', { actif })
    return
  }

  // `.select('id')` puis vérification : une mise à jour qui ne touche aucune ligne
  // ne renvoie aucune erreur, et le bouton aurait l'air d'avoir fonctionné.
  const { data, error } = await clientAdmin()
    .from('statuts')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error("Le statut n'a pas pu être mis à jour : aucun statut ne correspond.")
  }

  revalidatePath('/statuts')
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/membres/[id]/statuts', 'page')
}
```

- [ ] **Step 2 : Écrire le bouton de bascule**

Créer `src/app/statuts/bouton-bascule-statut.tsx` :

```tsx
'use client'

export function BoutonBasculeStatut({
  libelle,
  desactiver,
}: {
  libelle: string
  desactiver: boolean
}) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const message = desactiver
          ? `Désactiver le statut « ${libelle} » ?\n\n` +
            "Il ne pourra plus être attribué, mais les membres qui le portent le " +
            'conservent, et vous pourrez le réactiver.'
          : `Réactiver le statut « ${libelle} » ?`
        if (!window.confirm(message)) {
          evenement.preventDefault()
        }
      }}
      className={
        desactiver
          ? 'text-sm text-red-600 underline underline-offset-4'
          : 'text-sm underline underline-offset-4'
      }
    >
      {desactiver ? 'Désactiver' : 'Réactiver'}
    </button>
  )
}
```

- [ ] **Step 3 : Écrire les formulaires**

Créer `src/app/statuts/formulaire-catalogue.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { creerGroupe, creerStatut, type EtatCatalogue } from './actions'

const etatInitial: EtatCatalogue = { erreur: null }

export function FormulaireGroupe() {
  const [etat, envoyer, enCours] = useActionState(creerGroupe, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom du groupe</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 py-2">
          <input name="exclusif" type="checkbox" />
          <span className="text-sm">Un seul statut à la fois</span>
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}

export function FormulaireStatutCatalogue({ groupes }: { groupes: GroupeStatut[] }) {
  const [etat, envoyer, enCours] = useActionState(creerStatut, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Libellé</span>
          <input
            name="libelle"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Groupe</span>
          <select
            name="groupeId"
            required
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="" disabled>
              Choisir…
            </option>
            {groupes.map((groupe) => (
              <option key={groupe.id} value={groupe.id}>
                {groupe.nom}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
```

- [ ] **Step 4 : Écrire l'écran**

Créer `src/app/statuts/page.tsx` :

```tsx
import Link from 'next/link'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverStatut, reactiverStatut } from './actions'
import { BoutonBasculeStatut } from './bouton-bascule-statut'
import { FormulaireGroupe, FormulaireStatutCatalogue } from './formulaire-catalogue'

export default async function PageCatalogueStatuts() {
  await exigerAdministrateur()
  const groupes = await listerCatalogue(true)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Statuts</h1>

      {groupes.map((groupe) => (
        <section key={groupe.id} className="mb-8">
          <h2 className="mb-1 text-lg font-medium">{groupe.nom}</h2>
          <p className="mb-3 text-sm text-neutral-500">
            {groupe.exclusif
              ? "Un membre ne peut porter qu'un seul statut de ce groupe."
              : 'Les statuts de ce groupe se cumulent.'}
          </p>
          {groupe.statuts.length === 0 ? (
            <p className="text-sm text-neutral-600">Aucun statut dans ce groupe.</p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {groupe.statuts.map((statut) => (
                <li key={statut.id} className="flex items-center justify-between gap-4 py-3">
                  <span className={statut.actif ? '' : 'text-neutral-500'}>
                    {statut.libelle}
                    {statut.actif ? '' : ' — désactivé'}
                  </span>
                  <form action={statut.actif ? desactiverStatut : reactiverStatut}>
                    <input type="hidden" name="id" value={statut.id} />
                    <BoutonBasculeStatut libelle={statut.libelle} desactiver={statut.actif} />
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <h2 className="mb-4 text-lg font-medium">Ajouter un statut</h2>
      <div className="mb-10">
        <FormulaireStatutCatalogue groupes={groupes} />
      </div>

      <h2 className="mb-4 text-lg font-medium">Ajouter un groupe</h2>
      <FormulaireGroupe />
    </main>
  )
}
```

- [ ] **Step 5 : Relier depuis le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter un lien vers `/statuts` à côté de celui vers
`/antennes`, **conditionné à `estAdmin`** comme lui.

- [ ] **Step 6 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Puis, avec un compte administrateur jetable et Playwright :
1. `/statuts` affiche les deux groupes d'amorçage et leurs cinq statuts ;
2. ajouter un statut de test le fait apparaître, **et** dans le sélecteur d'attribution d'un membre ;
3. ajouter un statut portant un libellé déjà pris **dans le même groupe** affiche un message ;
4. désactiver ce statut demande confirmation, puis il apparaît « — désactivé » et disparaît du
   sélecteur d'attribution ;
5. le réactiver le remet dans les deux endroits.

Nettoie ensuite tout ce que tu as créé et confirme le retour à l'état initial : deux groupes,
cinq statuts, tous actifs.

- [ ] **Step 7 : Commit**

```bash
git add src/app/statuts src/app/tableau-de-bord/page.tsx
git commit -m "feat: gerer le catalogue des statuts"
```

---

### Task 8 : Statuts sur la fiche membre

**Files:**
- Modify: `src/app/membres/[id]/page.tsx`

**Interfaces:**
- Consumes: `statutsDuMembre` (Task 4)
- Produces: rien de réutilisable

- [ ] **Step 1 : Charger les statuts**

Dans `src/app/membres/[id]/page.tsx`, importer `statutsDuMembre` depuis `@/lib/donnees/statuts`
et charger les statuts en parallèle des rôles, en remplaçant l'appel isolé à `rolesDuProfil` :

```typescript
  const [roles, statuts] = await Promise.all([
    rolesDuProfil(profil.id),
    statutsDuMembre(membre.id),
  ])
  const estAdmin = roles.includes('administrateur')
```

- [ ] **Step 2 : Afficher la section**

Ajouter, après la liste des informations :

```tsx
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">Statuts</h2>
          <Link href={`/membres/${membre.id}/statuts`} className="text-sm underline underline-offset-4">
            Gérer
          </Link>
        </div>
        {statuts.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun statut attribué.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {statuts.map((statut) => (
              <li
                key={statut.statutId}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm"
              >
                {statut.libelle}
                {statut.dateAcquisition ? (
                  <span className="text-neutral-500"> · {statut.dateAcquisition}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
```

Le lien « Statuts » ajouté à la Task 6 dans la barre d'actions devient redondant avec « Gérer » :
retire-le de la barre et conserve celui-ci, plus proche de l'information qu'il concerne.

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Puis, sur un membre de test portant deux statuts, vérifie qu'ils s'affichent bien sur la fiche
avec leur date, et que « Gérer » mène à l'écran des statuts. Nettoie ensuite.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/membres/[id]/page.tsx"
git commit -m "feat: afficher les statuts sur la fiche membre"
```

---

### Task 9 : Tests des politiques RLS

**Files:**
- Create: `tests/rls/statuts.test.ts`

**Interfaces:**
- Consumes: politiques des Tasks 1 et 2
- Produces: rien de réutilisable

- [ ] **Step 1 : Écrire les tests**

Créer `tests/rls/statuts.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const IDENT = 'test.statuts.simple'
const NOM_ACTIF = `ZZStatut-actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_ARCHIVE = `ZZStatut-archive-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idProfil: string
let clientSimple: SupabaseClient
let idMembreActif: string
let idMembreArchive: string
let idStatutRepenti: string

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === identifiantVersEmail(identifiant))
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function supprimerMembres() {
  // `membre_statuts` et `journal_statuts` sont en `on delete cascade` sur `membres`.
  await admin.from('membres').delete().in('nom', [NOM_ACTIF, NOM_ARCHIVE])
}

beforeAll(async () => {
  await supprimerCompte(IDENT)
  await supprimerMembres()

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)
  idProfil = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfil, identifiant: IDENT, nom_affichage: 'Test statuts' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idProfil)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_ARCHIVE, prenom: 'Archive', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !membres) {
    await admin.auth.admin.deleteUser(idProfil)
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreActif = membres.find((m) => m.nom === NOM_ACTIF)!.id
  idMembreArchive = membres.find((m) => m.nom === NOM_ARCHIVE)!.id

  const { data: statut } = await admin
    .from('statuts')
    .select('id')
    .eq('libelle', 'Repenti')
    .single()
  idStatutRepenti = statut!.id

  // Un statut sur chaque membre, posé par la fonction atomique.
  for (const membre of [idMembreActif, idMembreArchive]) {
    const { error: erreurRpc } = await admin.rpc('attribuer_statut', {
      p_membre: membre,
      p_statut: idStatutRepenti,
      p_date: null,
      p_note: null,
      p_par: idProfil,
    })
    if (erreurRpc) {
      await admin.auth.admin.deleteUser(idProfil)
      await supprimerMembres()
      throw new Error(`attribution impossible : ${erreurRpc.message}`)
    }
  }

  clientSimple = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerMembres()
  await supprimerCompte(IDENT)
})

describe('lecture du catalogue', () => {
  it('un utilisateur actif lit les groupes et les statuts', async () => {
    const { data: groupes } = await clientSimple.from('groupes_statut').select('nom')
    const { data: statuts } = await clientSimple.from('statuts').select('libelle')
    expect(groupes!.length).toBeGreaterThanOrEqual(2)
    expect(statuts!.length).toBeGreaterThanOrEqual(5)
  })

  it('un visiteur anonyme se voit refuser la lecture des statuts', async () => {
    const { data, error } = await clientAnonyme.from('statuts').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un visiteur anonyme se voit refuser la lecture des groupes', async () => {
    const { data, error } = await clientAnonyme.from('groupes_statut').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })
})

describe("lecture des statuts d'un membre", () => {
  it("un utilisateur actif lit les statuts d'un membre actif", async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toEqual([{ statut_id: idStatutRepenti }])
  })

  it("un non-administrateur ne lit pas les statuts d'un membre archivé", async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreArchive)
    expect(data).toEqual([])
  })

  it("un utilisateur actif lit le journal d'un membre actif", async () => {
    const { data } = await clientSimple
      .from('journal_statuts')
      .select('action')
      .eq('membre_id', idMembreActif)
    expect(data!.length).toBeGreaterThanOrEqual(1)
    expect(data![0].action).toBe('ajout')
  })
})

describe('écriture refusée par défaut', () => {
  it('un utilisateur ne peut pas attribuer un statut', async () => {
    const { error } = await clientSimple
      .from('membre_statuts')
      .insert({ membre_id: idMembreActif, statut_id: idStatutRepenti })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })

  it('un utilisateur ne peut pas retirer un statut', async () => {
    const { error } = await clientSimple
      .from('membre_statuts')
      .delete()
      .eq('membre_id', idMembreActif)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })

  it('un utilisateur ne peut pas écrire dans le journal', async () => {
    const { error } = await clientSimple.from('journal_statuts').insert({
      membre_id: idMembreActif,
      statut_id: idStatutRepenti,
      action: 'retrait',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('un utilisateur ne peut pas créer un statut au catalogue', async () => {
    const libelleIntrus = `ZZIntrus-${crypto.randomUUID().slice(0, 8)}`
    const { data: groupe } = await admin.from('groupes_statut').select('id').limit(1).single()
    const { error } = await clientSimple
      .from('statuts')
      .insert({ groupe_id: groupe!.id, libelle: libelleIntrus })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('statuts').select('id').eq('libelle', libelleIntrus)
    expect(data).toEqual([])
  })
})

describe('compte désactivé', () => {
  // Ces trois tests sont la seule preuve d'exécution de `prive.est_actif()` sur les
  // tables de cette phase. Le troisième est un contrôle positif : sans lui, les deux
  // premiers passeraient aussi si la lecture était cassée pour une raison sans
  // rapport avec l'état du compte.
  it('un compte désactivé ne lit plus les statuts', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idProfil)
    try {
      const { data } = await clientSimple
        .from('membre_statuts')
        .select('statut_id')
        .eq('membre_id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idProfil)
    }
  })

  it('un compte désactivé ne lit plus le journal', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idProfil)
    try {
      const { data } = await clientSimple
        .from('journal_statuts')
        .select('id')
        .eq('membre_id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idProfil)
    }
  })

  it('un compte réactivé lit de nouveau les statuts', async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : Lancer les tests**

Run : `npm run test:rls`
Expected : rapporte le **compte réel** — il devrait passer de 22 à 34 tests (12 nouveaux).

**Si un test échoue, la faille est réelle : corrige la migration, jamais le test.** Si une
assertion sur `42501` échoue, relève le code obtenu, arrête-toi et renvoie DONE_WITH_CONCERNS.

- [ ] **Step 3 : Vérifier le nettoyage**

Aucun résidu de test dans `membres`, `membre_statuts`, `journal_statuts`, `statuts`, `profils`.
Deux groupes et cinq statuts d'amorçage, tous actifs.

- [ ] **Step 4 : Commit**

```bash
git add tests/rls/statuts.test.ts
git commit -m "test: verifier les politiques RLS des statuts"
```

---

### Task 10 : Test de bout en bout des statuts

**Files:**
- Create: `tests/e2e/statuts.spec.ts`

**Interfaces:**
- Consumes: l'application complète
- Produces: rien de réutilisable

- [ ] **Step 1 : Écrire les tests**

Créer `tests/e2e/statuts.spec.ts` :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENT_ADMIN = 'test.e2e.statuts.admin'
const IDENT_SIMPLE = 'test.e2e.statuts.simple'
// Tirés à chaque exécution : jamais de mot de passe littéral dans un dépôt public.
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
const NOM_MEMBRE = `ZZStatuts-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idMembre: string

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function nettoyer() {
  // `membre_statuts` et `journal_statuts` disparaissent en cascade avec le membre.
  await admin.from('membres').delete().like('nom', 'ZZStatuts-%')
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
}

async function creerCompte(identifiant: string, mdp: string, estAdmin: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  if (estAdmin) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
}

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, MDP_ADMIN, true)
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, false)

  const { data, error } = await admin
    .from('membres')
    .insert({ nom: NOM_MEMBRE, prenom: 'Jérôme' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre impossible : ${error?.message}`)
  idMembre = data.id
})

test.afterAll(nettoyer)

async function seConnecter(
  page: import('@playwright/test').Page,
  identifiant: string,
  mdp: string,
) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function attribuer(page: import('@playwright/test').Page, libelle: string) {
  await page.getByLabel('Statut (obligatoire)').selectOption({ label: libelle })
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()
}

test("attribuer un second statut du meme groupe evince le premier", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)

  await attribuer(page, 'Repenti')
  await expect(page.getByText('Repenti', { exact: true })).toBeVisible()

  await attribuer(page, 'Non-croyant')

  // « Cheminement » est un groupe exclusif : le premier statut doit avoir disparu.
  await expect(page.getByText('Non-croyant', { exact: true })).toBeVisible()
  await expect(page.getByText('Repenti', { exact: true })).toHaveCount(0)

  // Le journal doit porter les trois mouvements, dont le retrait automatique.
  await expect(page.getByText('Remplacé par un autre statut du même groupe')).toBeVisible()
  const { data } = await admin
    .from('journal_statuts')
    .select('action')
    .eq('membre_id', idMembre)
  expect(data).toHaveLength(3)
})

test("un statut d'un autre groupe se cumule sans rien retirer", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)

  await attribuer(page, "Baptisé d'eau")

  // « Engagements » n'est pas exclusif : les deux statuts coexistent. Sans ce test,
  // l'exclusivité pourrait s'appliquer partout sans que rien ne le signale.
  await expect(page.getByText("Baptisé d'eau", { exact: true })).toBeVisible()
  await expect(page.getByText('Non-croyant', { exact: true })).toBeVisible()
})

test("une date d'acquisition dans le futur est refusee", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)

  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Statut (obligatoire)').selectOption({ label: 'Baptisé du Saint-Esprit' })
  await page.getByLabel("Date d'acquisition").fill(demain)
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  await expect(page.locator(ALERTE)).toContainText('ne peut pas être dans le futur')

  const { data } = await admin
    .from('membre_statuts')
    .select('statut_id, statuts(libelle)')
    .eq('membre_id', idMembre)
  const libelles = (data ?? []).map((l) => (l.statuts as { libelle: string }).libelle)
  expect(libelles).not.toContain('Baptisé du Saint-Esprit')
})

test("un compte non administrateur ne peut pas attribuer de statut", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto(`/membres/${idMembre}/statuts`)

  // Il consulte : les statuts et le journal lui sont ouverts.
  await expect(page.getByRole('heading', { name: /Statuts de/ })).toBeVisible()
  await expect(page.getByText('Non-croyant', { exact: true })).toBeVisible()

  // Mais il n'a ni formulaire d'attribution, ni bouton de retrait.
  await expect(page.getByRole('button', { name: 'Attribuer ce statut' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(0)
})
```

- [ ] **Step 2 : Lancer les tests**

Run : `npm run test:e2e`
Expected : rapporte le **compte réel** — il devrait passer de 7 à 11 tests (4 nouveaux).

- [ ] **Step 3 : Prouver le dernier test par mutation**

Le quatrième test protège la barrière d'autorisation de l'attribution. Retire temporairement
l'appel à `exigerAdministrateur` dans `attribuerStatut` (`src/app/membres/[id]/statuts/actions.ts`),
relance la suite, et **constate que ce test échoue**. Rétablis ensuite le fichier à l'identique et
confirme qu'il n'apparaît pas dans `git status`.

Un test censé prouver qu'une barrière refuse ne vaut que s'il tombe quand elle disparaît.
Reporte la sortie de l'échec verbatim.

- [ ] **Step 4 : Vérifier le nettoyage**

Aucun résidu dans aucune table, catalogue revenu à son état d'amorçage.

- [ ] **Step 5 : Commit**

```bash
git add tests/e2e/statuts.spec.ts
git commit -m "test: couvrir l'attribution des statuts de bout en bout"
```

---

### Task 11 : Déploiement et documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: l'application complète
- Produces: la phase 1b en production

- [ ] **Step 1 : Vérifier l'ensemble des suites**

Run, dans l'ordre : `npx tsc --noEmit`, `npm run lint`, `npm test` (48 tests),
`npm run test:rls` (34 tests), `npm run test:e2e` (11 tests), `npm run build`.
Expected : les six passent. Rapporte les comptes réels.

- [ ] **Step 2 : Compléter le README**

Ajouter une section décrivant ce que la phase 1b apporte : statuts cumulables avec exclusivité
par groupe, dates d'acquisition, journal de tous les mouvements, catalogue administrable.

**Relis aussi les sections existantes** et corrige ce qui est devenu faux depuis leur écriture —
c'est le neuvième enseignement de la phase 1a : une documentation devient fausse sans que rien
ne bouge autour d'elle.

- [ ] **Step 3 : Déployer**

Le déploiement automatique est actif : la fusion sur `main` déploiera. Pour vérifier avant
fusion, lance `npx vercel --prod` et rapporte l'URL.

- [ ] **Step 4 : Vérifier en production**

Sur l'URL de production, avec un compte administrateur jetable et Playwright : attribuer un
statut, en attribuer un second du même groupe exclusif, vérifier l'éviction et le journal, puis
nettoyer entièrement.

Vérifie enfin que la signature de la clé de service est absente du code servi au navigateur,
**avec un contrôle positif** sur un texte connu.

- [ ] **Step 5 : Commit**

```bash
git add README.md
git commit -m "chore: documenter et deployer la phase 1b"
```

---

## Critères d'achèvement de la phase 1b

- [ ] `npm test` passe — 48 tests
- [ ] `npm run test:rls` passe — 34 tests, dont le contrôle positif du compte réactivé
- [ ] `npm run test:e2e` passe — 11 tests, dont la preuve par mutation du garde d'attribution
- [ ] `npm run build` passe sans erreur
- [ ] Aucune politique RLS d'écriture n'existe sur aucune table
- [ ] Toute page et toute action traverse `exigerProfilActif` ou `exigerAdministrateur` ;
      aucun appel direct à `profilCourant` hors de `garde.ts`
- [ ] Chaque écran livré est atteignable par un lien depuis le tableau de bord ou une fiche
- [ ] Chaque action réversible a son inverse dans l'interface : un statut désactivé se réactive,
      un statut retiré se réattribue
- [ ] L'exclusivité est prouvée dans un vrai navigateur, et le cumul aussi
- [ ] En production : attribution, éviction et journal fonctionnent
- [ ] La clé de service est absente du code servi au navigateur, contrôle positif à l'appui
