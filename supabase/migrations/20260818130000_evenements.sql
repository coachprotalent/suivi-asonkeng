-- Événements (spec §4.4, D13). Colonnes du §4.4, plus `heure_debut` (D56).
--
-- D56 — `date` ET `heure_debut time`, JAMAIS `timestamptz`. Le projet a déjà payé le
-- fuseau horaire une fois : `formaterDateSeule` (src/lib/format/date.ts) est verrouillé
-- en UTC par un invariant de test, et `seances_ael` porte `date date` + `heure time`. Une
-- retraite « du 12 au 14 » n'a pas d'instant, elle a des jours : l'afficher depuis un
-- instant ferait dépendre le libellé du fuseau du lecteur.

create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  -- NOT NULL et non vide : c'est aussi la SEULE prise du préfixe de famille des suites de
  -- test sur cette table (les suites écrivent en base de production).
  titre text not null,
  -- `restrict` : un type n'est jamais supprimé, seulement désactivé (spec §7, même régime
  -- que les statuts). Si une suppression directe était un jour tentée, elle ne doit pas
  -- orpheliner un événement passé.
  type_id uuid not null references public.types_evenement (id) on delete restrict,
  date_debut date not null,
  date_fin date,
  heure_debut time,
  lieu text,
  description text,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint evenements_titre_non_vide check (length(trim(titre)) > 0),
  -- Condition LOCALE À LA LIGNE : elle ne dépend d'aucune autre table, donc un `check` et
  -- non un déclencheur — même critère que D59 pour l'exclusivité des références de
  -- `participations`, et que D36 (phase 3) pour l'exclusivité enseignant/modérateur.
  -- `date_fin is null or …` : une date de fin absente est légitime (événement d'un jour).
  constraint evenements_periode_coherente check (date_fin is null or date_fin >= date_debut)
);

comment on table public.evenements is
  'Événement de l''équipe (spec §4.4, D13). Lisible de TOUT compte actif (spec §5.3) : c''est nécessaire pour afficher les séminaires assistés sur une fiche membre. Aucun état prevue/tenue/annulee, contrairement à seances_ael : aucun compteur du projet ne dépend de l''état d''un événement, et ajouter un état que rien ne consomme créerait une transition à garder cohérente pour zéro usage.';
comment on column public.evenements.date_debut is
  'Colonne `date`, jamais `timestamptz` (D56) : un événement a des JOURS, pas un instant.';
comment on column public.evenements.heure_debut is
  'Heure de début, séparée de la date (D56), sur le modèle de seances_ael.heure. NULL quand elle n''est pas connue ou n''a pas de sens (retraite de plusieurs jours).';
comment on constraint evenements_periode_coherente on public.evenements is
  'La date de fin, quand elle existe, ne précède jamais la date de début. Doublée côté application par `periodeValide` (src/lib/domaine/evenements.ts) pour nommer le champ fautif AVANT d''écrire : le check reste la barrière, le contrôle amont explique.';

-- La liste est triée `date_debut desc, id` (D75, tri TOTAL) : l'index porte les deux
-- colonnes dans cet ordre, sans quoi la pagination trierait en mémoire.
create index evenements_date_debut_idx on public.evenements (date_debut desc, id);
create index evenements_type_id_idx on public.evenements (type_id);
-- Prise du balayage de rattrapage des suites de test : un événement dont le titre aurait
-- été modifié hors du préfixe de famille reste retrouvable par son créateur.
create index evenements_cree_par_idx on public.evenements (cree_par);

revoke all on public.evenements from anon, authenticated;
grant select on public.evenements to authenticated;

alter table public.evenements enable row level security;
alter table public.evenements force row level security;

create policy evenements_lecture on public.evenements
  for select
  to authenticated
  using ((select prive.est_actif()));
