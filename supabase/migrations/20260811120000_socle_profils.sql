-- Socle d'authentification : profils et rôles.
-- Spec §4.1. Aucune écriture n'est autorisée au rôle client : voir la migration RLS.

-- Schéma privé pour les fonctions internes, jamais exposé via l'API.
create schema if not exists prive;
revoke all on schema prive from public, anon, authenticated;

create type public.role_app as enum ('administrateur', 'moderateur');

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  identifiant text not null unique,
  nom_affichage text not null,
  -- Clé étrangère vers public.membres ajoutée en phase 1 : la table n'existe pas encore.
  membre_id uuid unique,
  est_racine boolean not null default false,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint profils_identifiant_format
    check (identifiant ~ '^[a-z][a-z0-9.-]{2,31}$'),
  constraint profils_nom_affichage_non_vide
    check (length(trim(nom_affichage)) > 0),
  -- Le compte racine n'a jamais de fiche membre (spec §3.2).
  constraint profils_racine_sans_membre
    check (not est_racine or membre_id is null)
);

comment on table public.profils is
  'Un enregistrement par compte de connexion, en relation 1-1 avec auth.users.';
comment on column public.profils.membre_id is
  'Lien optionnel vers la fiche de suivi ; posable et retirable par l''administrateur.';

-- membre_id est déjà couvert par sa contrainte UNIQUE : pas d'index supplémentaire.
create index profils_actif_idx on public.profils (actif) where actif;

create table public.roles_profil (
  profil_id uuid not null references public.profils (id) on delete cascade,
  role public.role_app not null,
  attribue_le timestamptz not null default now(),
  primary key (profil_id, role)
);

comment on table public.roles_profil is
  'Rôles cumulables. Les droits « Utilisateur » sont le socle implicite de tout compte actif et ne sont pas stockés ici.';

-- profil_id est en tête de la clé primaire composite : la clé étrangère est déjà indexée.
