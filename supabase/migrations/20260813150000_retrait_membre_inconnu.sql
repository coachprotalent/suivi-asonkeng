-- Ronde de correction 2 sur la Task 5. Migration séparée et additive : celles déjà
-- appliquées (dont 20260813140000_marqueurs_erreurs_statuts.sql) ne se réécrivent pas.
--
-- Défaut introduit par la ronde 1 : `prive.retirer_statut` ne vérifiait jamais que le
-- membre existe, contrairement à `prive.attribuer_statut` qui le fait dès sa première
-- instruction. Un `membreId` forgé, ou périmé parce que la fiche a été supprimée
-- pendant que l'onglet était ouvert, supprime zéro ligne — exactement le même
-- comportement qu'un statut réellement déjà retiré. Les deux sortaient avec le même
-- marqueur `statut_absent`, que l'application traite depuis la ronde 1 comme un
-- succès idempotent : un membre inconnu se retrouvait donc redirigé en silence comme
-- si le retrait avait réussi.
--
-- Correctif : la même vérification, à la même place, que dans `attribuer_statut` —
-- première instruction du corps, verrou `for update` compris, pour la même raison :
-- sérialiser les opérations concurrentes sur un même membre avant tout le reste.

create or replace function prive.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supprimees integer;
begin
  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.'
      using detail = 'membre_inconnu';
  end if;

  delete from public.membre_statuts
  where membre_id = p_membre and statut_id = p_statut;

  get diagnostics v_supprimees = row_count;
  if v_supprimees = 0 then
    -- Un retrait sans effet ne doit pas passer pour un succès.
    raise exception 'Ce membre ne porte pas ce statut.'
      using detail = 'statut_absent';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
  values (p_membre, p_statut, 'retrait', p_par, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

comment on function prive.retirer_statut(uuid, uuid, uuid, text) is
  'Retire un statut porté par un membre. Lève avec detail = membre_inconnu si la fiche n''existe pas (même vérification et même place que attribuer_statut), et avec detail = statut_absent si le membre existe mais ne porte pas ce statut : un retrait sans effet ne doit pas passer pour un succès côté base — c''est à l''appelant de décider si ce second cas est une erreur ou un succès idempotent.';
