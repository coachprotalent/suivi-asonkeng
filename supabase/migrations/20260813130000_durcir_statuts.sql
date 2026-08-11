-- Durcissement issu de la revue de la Task 2. Migration séparée : les précédentes
-- sont déjà appliquées et ne se réécrivent pas.

-- 1. Le journal ne se réécrit pas.
--    Le commentaire de la table promettait « en insertion seule » sans que rien ne
--    l'impose : la trace était modifiable par la clé de service, c'est-à-dire par le
--    seul chemin d'écriture de l'application.
create or replace function prive.refuser_reecriture_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Le journal des statuts ne se réécrit pas.';
end;
$$;

create trigger journal_statuts_sans_reecriture
  before update on public.journal_statuts
  for each row execute function prive.refuser_reecriture_journal();

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut, protégée contre la réécriture par un déclencheur : aucune modification n''est possible, par personne. La suppression reste possible en cascade avec le membre — seule voie d''effacement complet d''une personne. L''application, elle, archive et ne supprime jamais.';

-- 2. Le garde d'exclusivité couvre aussi les modifications.
--    Il ne portait que sur `insert` : un `update` changeant `statut_id` pour un autre
--    statut du même groupe exclusif passait sans aucun contrôle, alors que le
--    commentaire promettait que l'invariant tenait pour toute écriture directe.
drop trigger if exists membre_statuts_exclusivite on public.membre_statuts;
create trigger membre_statuts_exclusivite
  before insert or update on public.membre_statuts
  for each row execute function prive.refuser_statut_exclusif_double();

-- 3. Attribution : verrou de concurrence, pas d'écrasement, journal fidèle.
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
    raise exception 'Membre inconnu.';
  end if;

  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = p_statut and s.actif;

  if v_groupe is null then
    raise exception 'Statut inconnu ou désactivé.';
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

-- 4. Retrait : une erreur d'usage doit sortir en 400, pas en 500.
--    `no_data_found` était traduit en erreur serveur par PostgREST, alors que
--    « ce membre ne porte pas ce statut » est une condition ordinaire.
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
    raise exception 'Ce membre ne porte pas ce statut.';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
  values (p_membre, p_statut, 'retrait', p_par, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

-- 5. Commentaires : dire ce que les objets font réellement.
comment on function prive.refuser_statut_exclusif_double() is
  'Garde d''invariant sur membre_statuts. Il s''exécute à chaque insertion et modification, et ne lève que si le membre porterait deux statuts d''un même groupe exclusif. Les fonctions d''attribution évinçant le concurrent avant d''insérer, il ne lève jamais sur le chemin normal.';

comment on function public.attribuer_statut(uuid, uuid, date, text, uuid) is
  'Passerelle appelable par l''API vers prive.attribuer_statut. Exécution réservée à service_role : le schéma prive n''est pas exposé et ne doit pas l''être.';

comment on function public.retirer_statut(uuid, uuid, uuid, text) is
  'Passerelle appelable par l''API vers prive.retirer_statut. Exécution réservée à service_role.';
