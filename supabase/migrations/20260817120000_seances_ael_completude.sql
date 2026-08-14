-- Refuse de tenir une séance sans thème ni enseignant (spec §7, D37). Barrière de
-- dernier recours, y compris pour une écriture directe ; le contrôle amont nommé vit
-- dans la Server Action `enregistrerSeance` (Task 15), qui produit le même diagnostic
-- AVANT d'écrire.

create or replace function prive.refuser_seance_tenue_incomplete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ne réagit QU'À l'état résultant `tenue` — jamais au sens retour (`prevue`,
  -- `annulee`), quelle qu'ait été la valeur avant cette écriture. C'est cette asymétrie
  -- volontaire qui rend la réversibilité de D49 possible sans deuxième migration : le
  -- même déclencheur sert les deux sens sans avoir à distinguer un aller-retour
  -- légitime d'une tentative de contournement.
  if new.etat <> 'tenue' then
    return new;
  end if;

  if new.theme is null or trim(new.theme) = '' then
    raise exception 'Une séance ne peut pas être tenue sans thème.'
      using detail = 'seance_sans_theme';
  end if;

  if new.enseignant_membre_id is null
     and (new.enseignant_libre is null or trim(new.enseignant_libre) = '') then
    raise exception 'Une séance ne peut pas être tenue sans enseignant.'
      using detail = 'seance_sans_enseignant';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_seance_tenue_incomplete() is
  'Déclencheur before insert or update (toute colonne) sur public.seances_ael : refuse tout état RÉSULTANT à ''tenue'' si le thème ou l''enseignant manquent, que la transition vienne de se produire ou que la ligne soit déjà tenue et modifiée ensuite. Ne réagit jamais au sens retour vers ''prevue'' ou ''annulee'' (D49). Deux marqueurs distincts (spec §7 : indication du champ manquant), pas un seul déguisé en généralité.';

create trigger seances_ael_tenue_complete
  before insert or update on public.seances_ael
  for each row execute function prive.refuser_seance_tenue_incomplete();
