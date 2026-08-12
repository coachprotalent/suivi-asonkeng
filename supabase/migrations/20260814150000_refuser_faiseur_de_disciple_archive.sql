-- CORRECTIF post-1c (1) : la revue finale de la 1c a montré que public.definir_arbre
-- (migration 20260814100000) ne vérifie JAMAIS l'état du faiseur de disciple proposé,
-- et que le déclencheur anti-cycle (membres_anti_cycle) ne contrôle que les cycles.
-- Le sélecteur de l'écran de rattachement ne propose que des membres actifs (spec §7),
-- mais rien n'empêchait un appel RPC forgé, ou une écriture directe sur la colonne, de
-- rattacher un membre ACTIF à un faiseur de disciple ARCHIVÉ — exactement l'état que
-- 20260814120000 déclare vouloir interdire.
--
-- Même schéma à deux barrières que le reste du projet : un déclencheur pour toute
-- écriture (y compris directe ou concurrente), et la même vérification dans la
-- passerelle pour que l'application affiche un message avant même d'écrire.

create or replace function prive.refuser_faiseur_de_disciple_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select m.etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple choisi est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_faiseur_de_disciple_archive() is
  'Déclencheur before insert or update of faiseur_de_disciple_id sur public.membres : refuse de rattacher un membre à un faiseur de disciple ARCHIVÉ. Barrière de dernier recours, sur le même modèle que membres_anti_cycle : la passerelle public.definir_arbre porte la même vérification pour produire un message avant d''écrire ; ce déclencheur protège aussi une écriture directe ou concurrente. Le marqueur ''faiseur_de_disciple_archive'' est le même que celui posé par prive.refuser_desarchivage_faiseur_archive (20260814140000) : même fait constaté — le faiseur de disciple visé est archivé — quelle que soit l''écriture qui le révèle.';

create trigger membres_faiseur_de_disciple_archive
  before insert or update of faiseur_de_disciple_id on public.membres
  for each row execute function prive.refuser_faiseur_de_disciple_archive();

-- Passerelle : même vérification, AVANT d'écrire, pour que l'application puisse
-- afficher un message utile sans attendre le déclencheur. `create or replace` :
-- 20260814100000 est déjà appliquée et ne se réécrit pas (contrainte globale 1). Le
-- corps ci-dessous reprend celui de 20260814100000 à l'identique, en n'ajoutant que la
-- vérification de l'état du faiseur de disciple proposé.
create or replace function public.definir_arbre(
  p_membre uuid,
  p_faiseur_de_disciple uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  -- PREMIÈRE instruction, avant toute lecture : voir l'en-tête de 20260814100000.
  -- Clé (20260814, 1) = arbre. La clé (20260814, 2) est réservée aux rôles.
  perform pg_advisory_xact_lock(20260814, 1);

  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.' using detail = 'membre_inconnu';
  end if;

  if p_faiseur_de_disciple is not null then
    select m.etat into v_etat_faiseur from public.membres m where m.id = p_faiseur_de_disciple;
    if not found then
      raise exception 'Faiseur de disciple inconnu.' using detail = 'faiseur_inconnu';
    end if;
    if v_etat_faiseur = 'archive' then
      raise exception 'Le faiseur de disciple choisi est archivé.'
        using detail = 'faiseur_de_disciple_archive';
    end if;
  end if;

  if p_dirigeant is not null then
    perform 1 from public.membres m where m.id = p_dirigeant;
    if not found then
      raise exception 'Dirigeant inconnu.' using detail = 'dirigeant_inconnu';
    end if;
  end if;

  -- Affectation DIRECTE et non `coalesce` : contrairement à `attribuer_statut`, un
  -- `null` veut dire ici « détacher », pas « ne change pas ». Détacher un membre pour
  -- en faire une racine de l'arbre est une opération légitime et prévue par la spec
  -- (« NULL pour les racines de l'arbre »). Le `coalesce` de la 1b avait justement
  -- rendu l'effacement volontaire impossible ; on ne reproduit pas ce choix là où
  -- l'effacement est un usage normal.
  update public.membres
     set faiseur_de_disciple_id = p_faiseur_de_disciple,
         dirigeant_id = p_dirigeant,
         dirigeant_force = p_dirigeant_force
   where id = p_membre;
end;
$$;

comment on function public.definir_arbre(uuid, uuid, uuid, boolean) is
  'Passerelle sérialisée (verrou 20260814,1) vers l''écriture de l''arbre des faiseurs de disciple et du dirigeant. Refuse un membre, un faiseur de disciple ou un dirigeant inconnu, un cycle, et — depuis ce correctif — un faiseur de disciple ARCHIVÉ, avant d''écrire. Exécution réservée à service_role.';
