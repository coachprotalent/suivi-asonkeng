-- Ronde de correction 1 sur la Task 6. Migration séparée et additive : celles déjà
-- appliquées (dont 20260813150000_retrait_membre_inconnu.sql, dernière version en
-- date de `prive.retirer_statut`, et 20260813140000_marqueurs_erreurs_statuts.sql,
-- dernière version en date de `prive.attribuer_statut`) ne se réécrivent pas.
--
-- Défaut : la politique `profils_lecture` (20260811130000_socle_rls.sql) limite un
-- compte non-administrateur à son propre profil. Or toute écriture de statut passe
-- par `exigerAdministrateur()`, donc `journal_statuts.par_profil_id` désigne toujours
-- un administrateur — jamais le lecteur non-admin courant. L'embed `profils(nom_affichage)`
-- utilisé par `journalDuMembre` rendait donc systématiquement `null` pour tout le
-- monde sauf les administrateurs eux-mêmes, c'est-à-dire pour le public même à qui cet
-- écran est destiné. Second défaut, plus grave : `par_profil_id` est en
-- `on delete set null`, donc la suppression d'un compte administrateur perdrait
-- l'auteur définitivement, pour tout le monde, pas seulement pour les non-admins.
--
-- Correctif retenu (décision utilisateur) : inscrire le nom de l'auteur dans le
-- journal au moment de l'écriture, comme un registre d'audit classique. Il devient
-- autonome — lisible sans dépendre des permissions de lecture courantes sur
-- `profils` — et survit à la suppression du compte auteur.

alter table public.journal_statuts add column par_nom_affichage text;

comment on column public.journal_statuts.par_nom_affichage is
  'Nom d''affichage de l''auteur, capturé au moment de l''écriture. Nul uniquement pour les lignes antérieures à cette migration, ou si le profil de l''auteur était déjà introuvable au moment de l''écriture : un défaut cosmétique de résolution du nom ne doit pas empêcher un mouvement par ailleurs valide.';

-- Le reste du corps de chaque fonction est recopié à l'identique depuis sa dernière
-- version appliquée : verrou `for update` en première instruction, vérification de
-- l'existence du membre, éviction du statut exclusif concurrent, `coalesce` sur
-- date/note pour ne jamais écraser une valeur existante avec une valeur absente,
-- détection `xmax = 0` pour journaliser un « ajout » et non une réattribution
-- silencieuse, marqueurs `using detail = '...'`. La seule addition : une résolution
-- du nom de l'auteur (`select ... into v_nom_auteur`, qui retombe silencieusement sur
-- `null` si `p_par` ne correspond à aucun profil, sans lever), et sa valeur portée
-- aux trois points d'insertion dans `journal_statuts` : l'éviction d'un statut
-- exclusif, l'ajout, et — dans `retirer_statut` — le retrait manuel.

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
  v_nom_auteur text;
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

  -- Résolution du nom au moment de l'écriture. `security definer` : cette lecture
  -- de `profils` n'est pas bridée par `profils_lecture`, contrairement à la lecture
  -- applicative qui a motivé cette migration. Un `p_par` sans profil correspondant
  -- laisse `v_nom_auteur` à `null`, sans lever.
  select p.nom_affichage into v_nom_auteur from public.profils p where p.id = p_par;

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

      insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, par_nom_affichage, motif)
      values (p_membre, v_evince, 'retrait', p_par, v_nom_auteur, 'Remplacé par un autre statut du même groupe');
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
    insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, par_nom_affichage)
    values (p_membre, p_statut, 'ajout', p_par, v_nom_auteur);
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
  v_nom_auteur text;
begin
  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.'
      using detail = 'membre_inconnu';
  end if;

  -- Même résolution, même raisonnement que dans attribuer_statut.
  select p.nom_affichage into v_nom_auteur from public.profils p where p.id = p_par;

  delete from public.membre_statuts
  where membre_id = p_membre and statut_id = p_statut;

  get diagnostics v_supprimees = row_count;
  if v_supprimees = 0 then
    -- Un retrait sans effet ne doit pas passer pour un succès.
    raise exception 'Ce membre ne porte pas ce statut.'
      using detail = 'statut_absent';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, par_nom_affichage, motif)
  values (p_membre, p_statut, 'retrait', p_par, v_nom_auteur, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

comment on function prive.attribuer_statut(uuid, uuid, date, text, uuid) is
  'Attribue un statut à un membre, atomiquement : verrou de concurrence sur la fiche, éviction du statut exclusif concurrent, journalisation fidèle. Capture le nom d''affichage de l''auteur dans journal_statuts.par_nom_affichage au moment de l''écriture, pour un journal lisible indépendamment des permissions de lecture sur profils et résistant à la suppression du compte auteur. Lève avec detail = membre_inconnu ou statut_inconnu pour les deux cas ordinaires, marqueurs stables destinés à l''application.';

comment on function prive.retirer_statut(uuid, uuid, uuid, text) is
  'Retire un statut porté par un membre. Capture le nom d''affichage de l''auteur dans journal_statuts.par_nom_affichage au moment de l''écriture, même raison que attribuer_statut. Lève avec detail = membre_inconnu si la fiche n''existe pas, et avec detail = statut_absent si le membre existe mais ne porte pas ce statut : un retrait sans effet ne doit pas passer pour un succès côté base — c''est à l''appelant de décider si ce second cas est une erreur ou un succès idempotent.';
