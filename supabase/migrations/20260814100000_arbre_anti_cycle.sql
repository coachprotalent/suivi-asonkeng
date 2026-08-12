-- Garde-fou anti-cycle de l'arbre des faiseurs de disciple (spec §4.2, §7).
-- Les colonnes existent depuis 20260812120000_membres.sql, qui annonçait déjà ce
-- déclencheur ; seules les contraintes CHECK « pas son propre faiseur de disciple »
-- y étaient posées, et elles ne couvrent que les cycles de longueur 1.

-- 1. Brique commune : `p_candidat` est-il un ancêtre de `p_membre` ?
--    `security definer` (design 1c, D19) : sous RLS, une fiche archivée est invisible
--    d'un non-administrateur, et la remontée s'arrêterait dessus — elle rétrécirait la
--    portée d'autorité sans erreur ni trace. L'autorité suit l'arbre, pas la visibilité.
--
--    La borne de profondeur n'est pas décorative. Elle est la seule protection restante
--    si une donnée corrompue franchissait un jour les barrières : sans elle, un cycle en
--    base transforme cette fonction en boucle infinie, donc en indisponibilité totale.
create or replace function prive.est_ancetre(p_candidat uuid, p_membre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select exists (
    select 1 from chaine c where c.faiseur_de_disciple_id = p_candidat
  );
$$;

comment on function prive.est_ancetre(uuid, uuid) is
  'Vrai si p_candidat figure parmi les ancêtres de p_membre dans l''arbre des faiseurs de disciple. Parcours borné à 64 niveaux.';

revoke execute on function prive.est_ancetre(uuid, uuid) from public, anon, authenticated;

-- 2. Déclencheur : barrière de dernier recours, y compris pour une écriture directe.
create or replace function prive.refuser_cycle_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  -- Déjà couvert par la contrainte CHECK membres_pas_son_propre_fdd, répété ici pour
  -- que le marqueur d'erreur soit le même quelle que soit la longueur du cycle : sans
  -- cela, l'application devrait reconnaître DEUX signaux pour une seule idée.
  if new.faiseur_de_disciple_id = new.id then
    raise exception 'Un membre ne peut pas être son propre faiseur de disciple.'
      using detail = 'cycle_faiseur_de_disciple';
  end if;

  -- Le faiseur de disciple proposé ne doit pas descendre du membre lui-même.
  -- Sur un UPDATE, `est_ancetre` lit l'état validé, où la ligne porte encore son
  -- ANCIEN faiseur de disciple : remonter depuis le faiseur proposé et retomber sur
  -- `new.id` est exactement la condition qui fermerait le cycle.
  if prive.est_ancetre(new.id, new.faiseur_de_disciple_id) then
    raise exception 'Ce rattachement créerait un cycle dans l''arbre des faiseurs de disciple.'
      using detail = 'cycle_faiseur_de_disciple';
  end if;

  return new;
end;
$$;

create trigger membres_anti_cycle
  before insert or update of faiseur_de_disciple_id on public.membres
  for each row execute function prive.refuser_cycle_faiseur_de_disciple();

-- 3. Passerelle applicative, sérialisée.
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
begin
  -- PREMIÈRE instruction, avant toute lecture : voir l'en-tête de cette migration.
  -- Clé (20260814, 1) = arbre. La clé (20260814, 2) est réservée aux rôles.
  perform pg_advisory_xact_lock(20260814, 1);

  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.' using detail = 'membre_inconnu';
  end if;

  if p_faiseur_de_disciple is not null then
    perform 1 from public.membres m where m.id = p_faiseur_de_disciple;
    if not found then
      raise exception 'Faiseur de disciple inconnu.' using detail = 'faiseur_inconnu';
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

revoke execute on function public.definir_arbre(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_arbre(uuid, uuid, uuid, boolean) to service_role;
