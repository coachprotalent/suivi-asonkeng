-- 20260814120000 refuse d'ARCHIVER un membre encore faiseur de disciple d'au moins un
-- disciple actif, mais ne surveille que la transition VERS archive. Elle laisse donc un
-- contournement entièrement atteignable depuis l'interface, sans rien forger :
--   1. archiver le disciple D (autorisé, D n'a pas de disciple actif) ;
--   2. archiver son faiseur de disciple M (autorisé : le contrôle ne compte que les
--      disciples ACTIFS, et D ne l'est plus depuis l'étape 1) ;
--   3. rétablir D directement (aucun contrôle ne surveille cette transition).
-- Résultat : D actif, rattaché à un faiseur de disciple archivé — exactement l'état que
-- 20260814120000 déclare vouloir interdire, atteint par la porte qu'elle laisse ouverte.

create or replace function prive.refuser_desarchivage_faiseur_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.etat <> 'actif' or old.etat = 'actif' then
    return new;
  end if;

  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple de ce membre est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_desarchivage_faiseur_archive() is
  'Déclencheur before update of etat sur public.membres : refuse de rendre un membre actif (transition vers actif) quand son faiseur de disciple est archivé (spec §7). Ferme le contournement de 20260814120000 décrit ci-dessus : archiver le disciple puis son faiseur de disciple passe (le disciple n''est déjà plus actif au second archivage), mais rétablir ensuite le disciple sans rien vérifier recréerait l''état que l''archivage interdit. Barrière de dernier recours, sur le même modèle que refuser_archivage_faiseur_de_disciple : le contrôle en amont, dans desarchiverMembre, nomme le faiseur de disciple concerné avant d''écrire ; ce déclencheur protège même une écriture directe ou concurrente.';

create trigger membres_desarchivage_faiseur_archive
  before update of etat on public.membres
  for each row execute function prive.refuser_desarchivage_faiseur_archive();
