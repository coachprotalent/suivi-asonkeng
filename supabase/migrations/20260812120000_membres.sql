-- Fiches membres (spec §4.2). Les colonnes d'arborescence existent dès maintenant mais
-- ne sont alimentées par aucune interface : le plan 1c leur ajoutera le déclencheur
-- anti-cycle et la logique de calcul du dirigeant.

create type public.situation_membre as enum ('etudiant', 'travailleur', 'autre');
create type public.etat_membre as enum ('en_attente', 'actif', 'archive');

create table public.membres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  telephone text,
  email_contact text,
  ville text,
  pays text,
  -- `restrict` et non `set null` : supprimer une antenne à laquelle des membres sont
  -- rattachés doit échouer bruyamment, pas les détacher en silence. La voie prévue
  -- est la désactivation (`actif = false`), qui préserve l'information.
  antenne_id uuid references public.antennes (id) on delete restrict,
  situation public.situation_membre,
  domaine_etude text,
  faiseur_de_disciple_id uuid references public.membres (id) on delete set null,
  dirigeant_id uuid references public.membres (id) on delete set null,
  dirigeant_force boolean not null default false,
  report_initial_ael integer not null default 0,
  etat public.etat_membre not null default 'actif',
  cree_le timestamptz not null default now(),
  cree_par uuid references public.profils (id) on delete set null,
  constraint membres_nom_non_vide check (length(trim(nom)) > 0),
  constraint membres_prenom_non_vide check (length(trim(prenom)) > 0),
  constraint membres_report_positif check (report_initial_ael >= 0),
  -- Un domaine d'étude n'a de sens que pour un étudiant.
  constraint membres_domaine_reserve_etudiant
    check (domaine_etude is null or situation = 'etudiant'),
  -- Un membre ne peut pas être son propre faiseur de disciple ni son propre dirigeant.
  -- Les cycles plus longs seront refusés par le déclencheur du plan 1c.
  constraint membres_pas_son_propre_fdd check (faiseur_de_disciple_id is distinct from id),
  constraint membres_pas_son_propre_dirigeant check (dirigeant_id is distinct from id)
);

comment on table public.membres is
  'Personne suivie par l''équipe. Distincte du compte de connexion : un membre peut exister sans compte (spec D1).';
comment on column public.membres.report_initial_ael is
  'AEL suivis avant la mise en service de l''application. Le compteur affiché y ajoute les présences enregistrées (spec D4).';

create index membres_antenne_id_idx on public.membres (antenne_id);
create index membres_faiseur_de_disciple_id_idx on public.membres (faiseur_de_disciple_id);
create index membres_dirigeant_id_idx on public.membres (dirigeant_id);
create index membres_cree_par_idx on public.membres (cree_par);
create index membres_etat_idx on public.membres (etat);

-- La clé étrangère annoncée par la phase 0, désormais possible.
alter table public.profils
  add constraint profils_membre_id_fkey
  foreign key (membre_id) references public.membres (id) on delete set null;

revoke all on public.membres from anon, authenticated;
grant select on public.membres to authenticated;

alter table public.membres enable row level security;
alter table public.membres force row level security;

-- Lecture : l'annuaire des membres actifs est ouvert à tout compte actif (spec D2).
-- Les fiches en attente et archivées restent réservées à l'administrateur.
create policy membres_lecture on public.membres
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (etat = 'actif' or (select prive.est_admin()))
  );

-- Aucune politique d'écriture : toutes les mutations passent par des Server Actions.
