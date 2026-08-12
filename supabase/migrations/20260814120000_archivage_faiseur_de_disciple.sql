-- Archiver un faiseur de disciple laisserait ses disciples rattachés à une fiche qui
-- ne figure plus dans l'annuaire : l'arbre resterait cohérent en base mais deviendrait
-- illisible à l'écran, et personne ne saurait plus qui suit ces personnes (spec §7).

create or replace function prive.refuser_archivage_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disciples integer;
begin
  if new.etat <> 'archive' or old.etat = 'archive' then
    return new;
  end if;

  select count(*) into v_disciples
  from public.membres m
  where m.faiseur_de_disciple_id = new.id
    and m.etat = 'actif';

  if v_disciples > 0 then
    raise exception 'Ce membre est encore faiseur de disciple de % personne(s) active(s).', v_disciples
      using detail = 'disciples_a_reaffecter';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_archivage_faiseur_de_disciple() is
  'Déclencheur before update of etat sur public.membres : refuse l''archivage (transition vers ''archive'') d''un membre qui est encore faiseur de disciple d''au moins un membre actif (spec §7). Barrière de dernier recours : le contrôle en amont, dans archiverMembre, nomme les personnes concernées avant d''écrire ; ce déclencheur protège même une écriture directe ou concurrente.';

create trigger membres_archivage_faiseur_de_disciple
  before update of etat on public.membres
  for each row execute function prive.refuser_archivage_faiseur_de_disciple();
