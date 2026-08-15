-- Phase 5, D81 / D82 / D83 / D84 / D90 — SEULE migration de la phase.
--
-- Crée une fiche membre, la place dans l'arbre et lui attribue ses statuts dans UNE
-- SEULE transaction. L'atomicité est tenue PAR CONSTRUCTION : après un échec à
-- n'importe quel point du corps, RIEN n'a persisté — ni la fiche, ni ses colonnes
-- d'arbre, ni ses membre_statuts, ni ses lignes de journal_statuts.
--
-- POURQUOI PAS DE COMPENSATION (D81). D27 a retenu la compensation pour l'inscription
-- parce qu'AUCUNE transaction ne couvrait ses deux écritures (un appel HTTP au service
-- d'authentification, une écriture SQL). Ici les trois écritures sont TOUTES du SQL sur
-- la MÊME base. Compenser exigerait de surcroît de SUPPRIMER une fiche `actif`, dont la
-- cascade emporte journal_statuts — que 20260813170000 désigne comme la seule voie
-- d'effacement complet d'une personne.
--
-- CETTE FONCTION COMPOSE, ELLE NE RECOPIE PAS (D82). Elle appelle public.definir_arbre
-- et public.attribuer_statut — les passerelles PUBLIQUES, celles-là mêmes qu'emploient
-- les écrans /membres/[id]/arbre et /membres/[id]/statuts, et non leurs versions
-- `prive` : les deux chemins ne peuvent pas diverger, et une correction future de l'un
-- corrige l'autre. Conséquence directe et VOULUE : cette fonction-ci n'introduit aucun
-- marqueur d'erreur nouveau pour l'arbre ni pour les statuts — membre_inconnu,
-- statut_inconnu, faiseur_inconnu, dirigeant_inconnu, faiseur_de_disciple_archive,
-- cycle_faiseur_de_disciple et le code 23514 gardent leur sens, et l'application les
-- discrimine avec le code qu'elle a déjà. Le SEUL marqueur nouveau posé par cette
-- fonction est statuts_exclusifs_incompatibles, ci-dessous.
--
-- UN SECOND MARQUEUR EXISTE DANS CETTE PHASE, ET IL NE VIENT PAS D'ICI :
-- faiseur_de_disciple_inactif, posé par public.definir_arbre et par le déclencheur
-- membres_faiseur_de_disciple_archive lorsque le faiseur visé existe mais n'est NI
-- actif NI archivé (donc en_attente). Il remonte à travers cette fonction comme tous
-- les autres marqueurs des passerelles appelées, sans qu'elle ait à le connaître.
--
-- AUCUN VERROU CONSULTATIF PROPRE (D83). Celui de l'arbre — pg_advisory_xact_lock(
-- 20260814, 1) — est pris par l'appel imbriqué à definir_arbre, en PREMIÈRE instruction
-- de celle-ci, et cela SUFFIT : entre l'insertion de la fiche et l'écriture de l'arbre
-- il n'y a AUCUNE fenêtre, c'est la même transaction, et une ligne qui n'existe pas
-- encore n'a aucun descendant — l'insertion seule ne peut donc fermer aucun cycle. Un
-- second pg_advisory_xact_lock sur la même clé serait ré-entrant, donc inoffensif, et
-- TROMPEUR : il laisserait croire que celui de definir_arbre ne suffit pas.
--
-- LE GARDE APPLICATIF EST exigerAdministrateur, ET C'EST UNE COÏNCIDENCE, PAS UNE
-- CONSTRUCTION (D90). attribuer_statut est normalement atteinte derrière
-- exigerAutoriteSur ; à travers cette fonction, elle l'est derrière
-- exigerAdministrateur. Les deux coïncident AUJOURD'HUI parce que la création d'une
-- fiche est réservée à l'administrateur (§5.2) et qu'un administrateur a autorité
-- partout (peutModifier court-circuite sur estAdmin). TOUT FUTUR APPELANT NON
-- ADMINISTRATEUR DE CETTE PASSERELLE EST UNE RÉGRESSION, PAS UNE RÉUTILISATION : il
-- élargirait en silence qui peut écrire un statut.
--
-- AUCUNE TRACE ÉCRITE DEPUIS L'INTÉRIEUR DE CETTE FONCTION NE SURVIVRAIT À SON ÉCHEC.
-- Postgres n'a pas de transaction autonome, et le projet l'a déjà payé (D43, 2b) :
-- consommer_token_inscription insérait une tentative puis levait, l'exception annulait
-- toute la transaction, l'insertion comprise, et le plafond anti-force-brute était
-- ENTIÈREMENT INOPÉRANT. Le diagnostic se journalise donc CÔTÉ APPLICATION, depuis
-- l'objet d'erreur retourné (code, details, message) — jamais par une insertion SQL de
-- journalisation ici, qui serait annulée avec le reste.
--
-- AUCUN INDEX NOUVEAU (D102). L'index qui serait la réponse si une mesure le demandait
-- un jour est nommé ici pour n'avoir pas à être redécouvert :
--   create index membres_arbre_idx on public.membres (faiseur_de_disciple_id, nom, prenom, id)
--     where etat = 'actif';
-- membres_faiseur_de_disciple_id_idx (20260812120000) existe déjà et sert le filtre, y
-- compris `is null` — un B-tree indexe les NULL. On pose l'index quand une mesure le
-- demandera, pas sur une intuition.

create or replace function public.creer_membre_enrichi(
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
  insert into public.membres (
    nom, prenom, telephone, email_contact, ville, pays, antenne_id,
    situation, domaine_etude, report_initial_ael, cree_par
  )
  values (
    p_nom, p_prenom, p_telephone, p_email_contact, p_ville, p_pays, p_antenne_id,
    p_situation, p_domaine_etude, coalesce(p_report_initial_ael, 0), p_par
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

comment on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) is
  'Phase 5, D81. Crée une fiche membre, la place dans l''arbre et lui attribue ses statuts dans UNE SEULE transaction : après un échec à n''importe quel point, rien n''a persisté. D82 : elle COMPOSE public.definir_arbre et public.attribuer_statut — les passerelles PUBLIQUES, pas leurs versions prive — et ne duplique ni ne contourne aucune de leurs vérifications ; elle n''introduit donc aucun marqueur d''erreur nouveau sauf statuts_exclusifs_incompatibles. D83 : elle ne prend AUCUN verrou consultatif propre, celui de l''arbre étant pris par l''appel imbriqué à definir_arbre, ce qui suffit — la même transaction ne laisse aucune fenêtre, et une ligne qui vient d''être insérée n''a aucun descendant. D84 : deux statuts d''un même groupe exclusif soumis ensemble sont REFUSÉS ici, jamais laissés à l''éviction de prive.attribuer_statut, qui journaliserait le retrait d''un statut jamais porté. D90, ET C''EST UNE COÏNCIDENCE, PAS UNE CONSTRUCTION : le garde applicatif de son unique appelant est exigerAdministrateur, alors que attribuer_statut est normalement atteinte derrière exigerAutoriteSur ; les deux coïncident parce que la création d''une fiche est réservée à l''administrateur et qu''un administrateur a autorité partout. TOUT FUTUR APPELANT NON ADMINISTRATEUR DE CETTE FONCTION EST UNE RÉGRESSION, PAS UNE RÉUTILISATION. Exécution réservée à service_role. Postgres n''ayant pas de transaction autonome, aucune trace écrite depuis l''intérieur de cette fonction ne survivrait à son échec : le diagnostic est journalisé par l''application, depuis l''objet d''erreur retourné.';

revoke execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) to service_role;
