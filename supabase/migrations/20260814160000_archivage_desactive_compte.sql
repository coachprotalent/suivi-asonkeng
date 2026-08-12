-- CORRECTIF post-1c (2) : D24, décision utilisateur consignée au §2 (amendement du
-- 2026-08-12) et au §7 de la spécification maîtresse. Archiver une fiche désactive le
-- compte qui lui est lié : sans cela, archiver quelqu'un ne lui retirait rien — son
-- compte restait actif et il conservait sa portée d'autorité sur les membres dont il
-- est ancêtre ou dirigeant désigné. L'archivage est le geste qui dit « cette personne a
-- quitté l'équipe » ; il doit fermer l'accès.
--
-- LA RÉCIPROQUE N'EST PAS VRAIE : ce correctif ne touche QUE la transition vers
-- 'archive'. Désarchiver ne réactive JAMAIS le compte (décision D24 explicite) —
-- rendre un accès est un geste délibéré, qui se prend sur l'écran des comptes, et la
-- personne aura de toute façon besoin d'un mot de passe temporaire.
--
-- CROISEMENT AVEC LA PROTECTION DU DERNIER ADMINISTRATEUR (spec §7) : si le compte lié
-- à la fiche archivée est le DERNIER administrateur actif, le désactiver laisserait
-- l'application sans administrateur, sans moyen d'en recréer un. Ce cas est REFUSÉ,
-- avec le même marqueur que public.definir_roles / public.definir_actif_compte
-- (''dernier_administrateur'') — c'est le même fait, découvert par une autre porte.
--
-- Le contrôle « reste-t-il un autre administrateur actif ? » est un lire-puis-écrire :
-- il se fait sous le MÊME verrou consultatif que public.definir_roles et
-- public.definir_actif_compte (clé (20260814, 2), voir 20260814130000), pour qu'une
-- désactivation posée ici et un changement de rôle posé là-bas se sérialisent
-- réellement, plutôt que de courir chacun sur sa propre clé.

create or replace function prive.desactiver_compte_a_larchivage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil_id uuid;
  v_profil_actif boolean;
  v_est_admin boolean;
begin
  if new.etat <> 'archive' or old.etat = 'archive' then
    return new;
  end if;

  select p.id, p.actif into v_profil_id, v_profil_actif
  from public.profils p
  where p.membre_id = new.id;

  -- Aucun compte lié, ou déjà désactivé : rien à faire, et surtout rien à verrouiller
  -- pour ne rien faire.
  if v_profil_id is null or not v_profil_actif then
    return new;
  end if;

  -- Même clé que public.definir_roles / public.definir_actif_compte : voir l'en-tête.
  perform pg_advisory_xact_lock(20260814, 2);

  select exists (
    select 1 from public.roles_profil r
    where r.profil_id = v_profil_id and r.role = 'administrateur'
  ) into v_est_admin;

  if v_est_admin and prive.compter_administrateurs_actifs(v_profil_id) = 0 then
    raise exception 'Le compte lié à cette fiche est le dernier administrateur actif : l''archiver le désactiverait et laisserait l''application sans administrateur. Donnez le rôle administrateur à quelqu''un d''autre avant d''archiver cette fiche.'
      using detail = 'dernier_administrateur';
  end if;

  update public.profils set actif = false where id = v_profil_id;

  return new;
end;
$$;

comment on function prive.desactiver_compte_a_larchivage() is
  'Déclencheur before update of etat sur public.membres (transition vers ''archive'', spec §7 / D24) : désactive le compte ACTIF lié à la fiche archivée, sous le verrou (20260814, 2) partagé avec public.definir_roles / public.definir_actif_compte. Refuse l''archivage — marqueur ''dernier_administrateur'' — si ce compte est le dernier administrateur actif de l''application. Ne fait RIEN sur la transition inverse : désarchiver ne réactive jamais un compte, décision D24 délibérée.';

create trigger membres_archivage_desactive_compte
  before update of etat on public.membres
  for each row execute function prive.desactiver_compte_a_larchivage();
