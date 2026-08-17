-- Phase 7, D130 / D135 — le contact devient saisissable À LA CRÉATION.
--
-- MIGRATION ADDITIVE : 20260819120000_creer_membre_enrichi.sql est déjà appliquée et ne se
-- réécrit pas. Celle-ci REMPLACE la fonction ; elle ne la modifie pas sur place.
--
-- ═══ POURQUOI UN `drop` ET PAS UN `create or replace` (D135) ═══
-- `create or replace function` NE PEUT PAS changer une signature. Sans le `drop` ci-dessous,
-- cette migration créerait une SURCHARGE : les deux fonctions coexisteraient, PostgREST
-- choisirait l'une ou l'autre selon les arguments nommés reçus, et l'ancienne — qui ignore
-- le contact — resterait appelable. Un contact saisi disparaîtrait alors EN SILENCE.
--
-- LES PRIVILÈGES NE SURVIVENT PAS AU `drop` : le `revoke`/`grant` en pied de fichier n'est
-- pas décoratif. Sans lui, `service_role` perdrait le droit d'exécution et la création de
-- membre tomberait EN PRODUCTION, sans que le déploiement de la migration ne signale rien.
-- `drop` et `create` étant dans la MÊME transaction de migration, aucune fenêtre ne s'ouvre
-- pendant laquelle la fonction serait absente.
--
-- ═══ LE CONTACT EST ÉCRIT DANS L'`insert` DE LA FICHE (D130) ═══
-- Pas par `public.definir_arbre` : c'est une colonne ordinaire de la fiche. Il n'entre donc
-- PAS dans la condition qui décide d'appeler `definir_arbre` (étape 3) — une création avec
-- un contact et SANS place dans l'arbre ne doit pas la déclencher, ce qui prendrait le
-- verrou consultatif et réécrirait trois `null` déjà en place. Une preuve dédiée mesure
-- exactement ce point (`tests/rls/creation-enrichie.test.ts`, « un contact SEUL ne place
-- PAS la fiche dans l'arbre »).
--
-- ═══ AUCUN MARQUEUR D'ERREUR NOUVEAU ═══
-- Un `p_contact` inexistant viole la clé étrangère `membres_contact_id_fkey` (23503) ; un
-- `p_contact` égal à la fiche créée est IMPOSSIBLE, l'identifiant étant engendré par
-- l'`insert` lui-même — `membres_pas_son_propre_contact` est donc inatteignable par cette
-- porte. L'application ne discrimine PAS sur la violation de clé étrangère : PostgREST n'en
-- rend le nom de contrainte que dans `error.message`, de la prose anglaise dont la
-- contrainte globale du projet interdit de discriminer. Elle s'appuie sur un contrôle amont
-- (D136), qui EXPLIQUE là où la clé étrangère PROTÈGE.
--
-- LE RESTE DU CORPS EST RECOPIÉ À L'IDENTIQUE depuis 20260819120000, commentaires compris.
-- Les DEUX seules différences sont marquées « PHASE 7 » dans le corps.

drop function if exists public.creer_membre_enrichi(
  text, text, text, text, text, text, uuid, public.situation_membre, text, integer,
  uuid, uuid, boolean, jsonb, uuid
);

create function public.creer_membre_enrichi(
  p_nom text,
  p_prenom text,
  p_telephone text,
  p_email_contact text,
  p_ville text,
  p_pays text,
  p_antenne_id uuid,
  p_situation public.situation_membre,
  p_domaine_etude text,
  p_report_initial_ael integer,
  p_contact uuid,
  p_faiseur_de_disciple uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean,
  p_statuts jsonb,
  p_par uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
  v_groupe_fautif text;
  v_ligne record;
begin
  -- 1. REFUS DU COUPLE EXCLUSIF, AVANT TOUTE ÉCRITURE (D84).
  --
  -- Les groupes sont RELUS EN BASE depuis p_statuts, jamais pris d'une liste venue de
  -- l'écran : listerCatalogue est non bornée, et une lecture tronquée côté application
  -- se traduirait par « aucun conflit détecté ». La fonction pure amont EXPLIQUE (elle
  -- nomme les deux statuts), cette barrière PROTÈGE.
  --
  -- POURQUOI NE PAS LAISSER FAIRE L'ÉVICTION de prive.attribuer_statut : elle est conçue
  -- pour une attribution ULTÉRIEURE qui remplace une attribution ANTÉRIEURE — elle
  -- supprime, journalise un `retrait` motivé, et c'est juste. À la création, les deux
  -- statuts arrivent dans le MÊME geste : l'éviction ferait disparaître le premier en
  -- silence et inscrirait au journal le retrait d'un statut que la personne n'a jamais
  -- porté plus d'une transaction. Le journal MENTIRAIT sur ce qui s'est passé —
  -- exactement ce que le `if v_nouveau` d'attribuer_statut protège par ailleurs.
  --
  -- `count(distinct st.id) > 1` et non `count(*) > 1` : soumettre DEUX FOIS le même
  -- statut n'est pas un couple exclusif. Ce cas passe donc ici, et la boucle plus bas
  -- appelle attribuer_statut deux fois — le second appel est un upsert sans effet qui
  -- ne journalise aucun `ajout` (détection xmax = 0). Comportement voulu.
  --
  -- Aucun filtre sur st.actif : un statut désactivé sera de toute façon refusé par
  -- attribuer_statut avec detail = 'statut_inconnu'. Le refus d'exclusivité doit mordre
  -- quel que soit l'état du statut, pas seulement sur les actifs.
  select g.nom into v_groupe_fautif
  from jsonb_to_recordset(coalesce(p_statuts, '[]'::jsonb))
         as s(statut_id uuid, date_acquisition date, note text)
  join public.statuts st on st.id = s.statut_id
  join public.groupes_statut g on g.id = st.groupe_id
  where g.exclusif
  group by g.id, g.nom
  having count(distinct st.id) > 1
  limit 1;

  if found then
    raise exception 'Deux statuts du groupe « % » ont été soumis ensemble, or ce groupe est exclusif.', v_groupe_fautif
      using detail = 'statuts_exclusifs_incompatibles';
  end if;

  -- 2. LA FICHE.
  --
  -- `etat` n'est PAS fourni : le défaut de la colonne ('actif') s'applique, exactement
  -- comme le faisait creerMembre. `cree_par = p_par`.
  --
  -- NOTE VÉRIFIÉE : les deux déclencheurs `before insert or update of
  -- faiseur_de_disciple_id` (membres_anti_cycle, membres_faiseur_de_disciple_archive) se
  -- déclenchent AUSSI sur l'insertion — la clause `of colonne` ne restreint que les
  -- `update`. Ils sortent immédiatement, new.faiseur_de_disciple_id étant null à ce
  -- stade.
  --
  -- ═══ PHASE 7, D130 — DIFFÉRENCE 1 SUR 2 : `contact_id` / `p_contact` ═══
  -- Le contact est écrit ICI, avec les colonnes de la fiche. AUCUN déclencheur ne porte sur
  -- cette colonne (D131) ; seule la clé étrangère `membres_contact_id_fkey` peut refuser.
  insert into public.membres (
    nom, prenom, telephone, email_contact, ville, pays, antenne_id,
    situation, domaine_etude, report_initial_ael, contact_id, cree_par
  )
  values (
    p_nom, p_prenom, p_telephone, p_email_contact, p_ville, p_pays, p_antenne_id,
    p_situation, p_domaine_etude, coalesce(p_report_initial_ael, 0), p_contact, p_par
  )
  returning id into v_membre;

  -- 3. L'ARBRE — SEULEMENT si l'un des trois est renseigné.
  --
  -- Appelée sans condition, definir_arbre prendrait le verrou et réécrirait trois null
  -- déjà en place. C'est elle qui prend le verrou consultatif (D83), et c'est elle qui
  -- refuse un faiseur inconnu, archivé, ou fermant un cycle.
  --
  -- `p_dirigeant_force` vrai SEUL est un cas légitime : un administrateur qui force
  -- « aucun dirigeant » sur une fiche sans faiseur de disciple exprime un choix, et ce
  -- choix doit être enregistré.
  --
  -- ═══ PHASE 7, D130 — DIFFÉRENCE 2 SUR 2 : ELLE EST UNE ABSENCE ═══
  -- `p_contact` N'EST PAS dans cette condition, et ne doit jamais y entrer. Le contact
  -- n'est pas une relation d'arbre : une création « contact seul » ne doit prendre aucun
  -- verrou consultatif ni traverser definir_arbre. Une preuve dédiée le mesure.
  if p_faiseur_de_disciple is not null
     or p_dirigeant is not null
     or coalesce(p_dirigeant_force, false) then
    perform public.definir_arbre(
      v_membre, p_faiseur_de_disciple, p_dirigeant, coalesce(p_dirigeant_force, false)
    );
  end if;

  -- 4. LES STATUTS.
  --
  -- jsonb_to_recordset(...) as (...) est une DÉCLARATION DE TYPES : elle échoue
  -- franchement sur une valeur mal formée plutôt que de retomber sur NULL. C'est la
  -- raison pour laquelle les colonnes de la fiche restent en paramètres explicites et
  -- typés : une clé mal orthographiée dans un jsonb deviendrait une colonne NULL EN
  -- SILENCE. Une liste de longueur variable, elle, ne peut pas être un paramètre fixe.
  for v_ligne in
    select s.statut_id, s.date_acquisition, s.note
    from jsonb_to_recordset(coalesce(p_statuts, '[]'::jsonb))
           as s(statut_id uuid, date_acquisition date, note text)
  loop
    if v_ligne.statut_id is null then
      -- Une entrée sans statut_id (clé absente ou mal orthographiée) ne doit pas être
      -- ignorée en silence : c'est exactement le mode de défaillance que le typage
      -- ci-dessus existe pour fermer. Même marqueur que attribuer_statut, même sens.
      raise exception 'Statut inconnu ou désactivé.'
        using detail = 'statut_inconnu';
    end if;
    perform public.attribuer_statut(
      v_membre, v_ligne.statut_id, v_ligne.date_acquisition, v_ligne.note, p_par
    );
  end loop;

  return v_membre;
end;
$$;

comment on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) is
  'Phase 5, D81, étendue par la phase 7 (D130, D135) au champ contact. Crée une fiche membre, la place dans l''arbre et lui attribue ses statuts dans UNE SEULE transaction : après un échec à n''importe quel point, rien n''a persisté. LE CONTACT EST ÉCRIT DANS L''INSERT DE LA FICHE, comme une colonne ordinaire, et n''entre PAS dans la condition d''appel à public.definir_arbre — une création « contact seul » ne prend donc aucun verrou consultatif. D82 : elle COMPOSE public.definir_arbre et public.attribuer_statut — les passerelles PUBLIQUES, pas leurs versions prive — et ne duplique ni ne contourne aucune de leurs vérifications ; elle n''introduit aucun marqueur d''erreur nouveau sauf statuts_exclusifs_incompatibles, et le contact n''en ajoute aucun (un contact inexistant viole la clé étrangère, 23503). D83 : elle ne prend AUCUN verrou consultatif propre, celui de l''arbre étant pris par l''appel imbriqué à definir_arbre, ce qui suffit. D84 : deux statuts d''un même groupe exclusif soumis ensemble sont REFUSÉS ici, jamais laissés à l''éviction de prive.attribuer_statut, qui journaliserait le retrait d''un statut jamais porté. D90, ET C''EST UNE COÏNCIDENCE, PAS UNE CONSTRUCTION : le garde applicatif de son unique appelant est exigerAdministrateur, alors que attribuer_statut est normalement atteinte derrière exigerAutoriteSur ; les deux coïncident parce que la création d''une fiche est réservée à l''administrateur et qu''un administrateur a autorité partout. TOUT FUTUR APPELANT NON ADMINISTRATEUR DE CETTE FONCTION EST UNE RÉGRESSION, PAS UNE RÉUTILISATION. Exécution réservée à service_role. Postgres n''ayant pas de transaction autonome, aucune trace écrite depuis l''intérieur de cette fonction ne survivrait à son échec : le diagnostic est journalisé par l''application, depuis l''objet d''erreur retourné.';

revoke execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) to service_role;
