-- Ronde de correction 1 sur la Task 5. Migration séparée et additive : celles déjà
-- appliquées (dont 20260813130000_durcir_statuts.sql) ne se réécrivent pas.
--
-- Les trois `raise exception` ci-dessous sortent en P0001 depuis le durcissement
-- précédent (errcode = 'no_data_found' cassait PostgREST). P0001 ne suffit plus à
-- l'application pour distinguer ces trois cas d'un échec réellement inattendu : elle
-- a besoin d'un marqueur stable, indépendant du texte français. `using detail = '...'`
-- porte ce marqueur ; PostgREST l'expose et supabase-js le rend dans `error.details`.
-- Le code HTTP reste 400 (P0001 n'est pas un code serveur pour PostgREST).
--
-- Le reste du corps de chaque fonction est recopié à l'identique depuis
-- 20260813130000_durcir_statuts.sql : verrou `for update` en première instruction,
-- éviction du statut exclusif concurrent, `coalesce` sur date/note pour ne jamais
-- écraser une valeur existante avec une valeur absente, détection `xmax = 0` pour
-- journaliser un « ajout » et non une réattribution silencieuse.

create or replace function prive.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
  v_evince uuid;
  v_nouveau boolean;
begin
  -- `for update` verrouille la ligne du membre pour la durée de la transaction.
  -- Sans ce verrou, deux attributions simultanées de deux statuts d'un même groupe
  -- exclusif réussiraient toutes les deux : aucune ne voit l'insertion non validée
  -- de l'autre, leurs clés primaires diffèrent, et le déclencheur ne voit rien. Le
  -- membre porterait alors deux statuts qui s'excluent, sans la moindre erreur.
  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.'
      using detail = 'membre_inconnu';
  end if;

  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = p_statut and s.actif;

  if v_groupe is null then
    raise exception 'Statut inconnu ou désactivé.'
      using detail = 'statut_inconnu';
  end if;

  if v_exclusif then
    for v_evince in
      select ms.statut_id
      from public.membre_statuts ms
      join public.statuts s2 on s2.id = ms.statut_id
      where ms.membre_id = p_membre and s2.groupe_id = v_groupe and ms.statut_id <> p_statut
    loop
      delete from public.membre_statuts
      where membre_id = p_membre and statut_id = v_evince;

      insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
      values (p_membre, v_evince, 'retrait', p_par, 'Remplacé par un autre statut du même groupe');
    end loop;
  end if;

  -- `coalesce` plutôt qu'écrasement : réattribuer un statut déjà porté sans
  -- renseigner de date effacerait la date d'acquisition existante — une information
  -- qu'on ne retrouve pas. Une valeur fournie remplace, une valeur absente laisse.
  insert into public.membre_statuts (membre_id, statut_id, date_acquisition, note, attribue_par)
  values (p_membre, p_statut, p_date, nullif(trim(coalesce(p_note, '')), ''), p_par)
  on conflict (membre_id, statut_id) do update
    set date_acquisition = coalesce(excluded.date_acquisition, membre_statuts.date_acquisition),
        note = coalesce(excluded.note, membre_statuts.note),
        attribue_par = excluded.attribue_par,
        attribue_le = now()
  returning (xmax = 0) into v_nouveau;

  -- Journaliser un « ajout » alors que le statut était déjà porté ferait mentir le
  -- journal sur ce qui s'est réellement passé.
  if v_nouveau then
    insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id)
    values (p_membre, p_statut, 'ajout', p_par);
  end if;
end;
$$;

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

comment on function prive.attribuer_statut(uuid, uuid, date, text, uuid) is
  'Attribue un statut à un membre, atomiquement : verrou de concurrence sur la fiche, éviction du statut exclusif concurrent, journalisation fidèle. Lève avec detail = membre_inconnu ou statut_inconnu pour les deux cas ordinaires, marqueurs stables destinés à l''application.';

comment on function prive.retirer_statut(uuid, uuid, uuid, text) is
  'Retire un statut porté par un membre. Lève avec detail = statut_absent si le membre ne le porte pas : un retrait sans effet ne doit pas passer pour un succès côté base — c''est à l''appelant de décider si ce cas est une erreur ou un succès idempotent.';
