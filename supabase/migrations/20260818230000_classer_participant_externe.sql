-- Classement sans suite d'un participant externe (D55, D61, D62). L'autre façon — et la
-- seule autre — de vider la liste « à traiter ».
--
-- D55 — réservé à l'ADMINISTRATEUR SEUL au niveau applicatif (exigerAdministrateur), comme
-- la conversion. La matrice du §5.2 était SILENCIEUSE sur ce geste ; son silence est
-- comblé, pas réinterprété. Ouvrir le classement au modérateur tout en lui refusant la
-- conversion permettrait de VIDER LA LISTE DE TRAVAIL DE L'ADMINISTRATEUR SANS CONVERTIR
-- PERSONNE.
--
-- D61 — le classement porte sur la PERSONNE, jamais sur une participation : une personne
-- ayant exprimé le désir à deux séminaires produit deux participations, et classer l'une
-- la laisserait dans la liste par l'autre.
--
-- Aucun verrou consultatif : l'invariant ne dépasse pas la ligne écrite (même raisonnement
-- que D38 (phase 3) et que definirAntenneMembre). Le `for update` sérialise deux
-- classements concurrents du même participant, ce qui est tout ce qui est en jeu.

create or replace function public.classer_participant_externe(
  p_participant uuid,
  p_motif text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants_externes%rowtype;
begin
  -- Contrôle du motif AVANT toute lecture : c'est le refus le plus probable, et il ne
  -- demande aucune donnée. La contrainte participants_externes_classement_coherent reste
  -- la barrière ; ce contrôle amont explique, avec un marqueur exploitable, plutôt qu'un
  -- 23514 opaque.
  if p_motif is null or length(trim(p_motif)) = 0 then
    raise exception 'Un motif de classement est obligatoire.'
      using detail = 'motif_classement_vide';
  end if;

  select * into v_participant
  from public.participants_externes x
  where x.id = p_participant
  for update;

  if not found then
    raise exception 'Participant externe inconnu.'
      using detail = 'participant_inconnu';
  end if;

  -- Un participant DÉJÀ CONVERTI n'a plus rien à faire dans la liste : le classer n'aurait
  -- aucun effet visible (la vue l'exclut déjà) et laisserait croire à un geste utile.
  if v_participant.converti_en_membre_id is not null then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  -- D62 — pas de réouverture, et pas de reclassement non plus. Barrière amont doublée par
  -- le déclencheur participants_externes_liens_definitifs, qui protège même une écriture
  -- directe.
  if v_participant.classe_le is not null then
    raise exception 'Ce participant a déjà été classé sans suite.'
      using detail = 'classement_definitif';
  end if;

  update public.participants_externes
     set classe_le = now(),
         classe_par = p_par,
         motif_classement = trim(p_motif)
   where id = p_participant;
end;
$$;

comment on function public.classer_participant_externe(uuid, text, uuid) is
  'Classe sans suite un participant externe, avec motif obligatoire (D55, D61, D62). Le classement porte sur la PERSONNE, jamais sur une participation : c''est ce qui rend le vidage de la liste « à traiter » vrai quel que soit le nombre d''événements fréquentés. Définitif — ni déclassement ni reclassement (D62) — mais N''INTERDIT PAS une conversion ultérieure : « pas de réouverture » porte sur la liste, pas sur le sort de la personne. Réservé à l''administrateur seul au niveau applicatif (D55), la matrice du §5.2 étant silencieuse sur ce geste avant lui. Marqueurs via `using detail` : motif_classement_vide, participant_inconnu, participant_deja_converti, classement_definitif. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.classer_participant_externe(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.classer_participant_externe(uuid, text, uuid)
  to service_role;
