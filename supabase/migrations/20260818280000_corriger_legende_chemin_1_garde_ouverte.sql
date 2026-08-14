-- Revue finale de branche, constat I1. LA LÉGENDE DÉPLOYÉE DIT L'INVERSE DE LA VÉRITÉ, ET
-- C'EST LA TÂCHE SUIVANTE QUI L'A RENDUE FAUSSE.
--
-- 20260818260000 avait corrigé, dans le corps de cette fonction, un état FUTUR présenté
-- comme un état PRÉSENT : le commentaire de 20260818220000 affirmait que la garde d'origine
-- de `validerDemandeNouvellePersonne` acceptait déjà `conversion_participant`, alors qu'elle
-- ne l'acceptait pas encore. La correction était juste AU MOMENT OÙ ELLE A ÉTÉ ÉCRITE.
--
-- Puis la Task 22 (commit 936d434) A OUVERT CETTE GARDE. Aucune migration postérieure n'a
-- réémis la fonction, si bien que le corps DÉPLOYÉ affirme aujourd'hui, au présent, que la
-- garde « n'accepte QUE `auto_inscription` et `demande_suivi` » et qu'une fiche du chemin 1
-- reste `en_attente` « SANS AUCUN GESTE POSSIBLE » — mesuré en base avant cette migration :
-- `position('PAS ENCORE OUVERT' in prosrc) = 2319`, `length(prosrc) = 7707`.
--
-- C'EST LE SYMÉTRIQUE EXACT DU DÉFAUT CRITIQUE DE LA REVUE PRÉ-VOL. Le plan disait alors
-- « achevable » quand ça ne l'était pas ; la base dit « inachevable » maintenant que ça
-- l'est. Le coût est réel : quelqu'un qui lit la fonction déployée — le geste que ce projet
-- recommande partout, « lire le fichier appliqué avant d'écrire » — en conclut que le chemin
-- 1 est un piège et qu'il faut soit le retirer, soit refermer la garde.
--
-- Une ligne de commentaire n'est pas un objet séparé qu'on puisse recommenter (`comment on
-- ...`) : elle vit dans le CORPS de la fonction (pg_proc.prosrc), donc la seule façon de la
-- corriger sans modifier la migration déjà appliquée est de RECRÉER la fonction. C'est un
-- `create or replace function` STRICTEMENT additif (nouveau fichier, même signature) : il ne
-- touche à AUCUNE ligne exécutable, seulement au commentaire du bloc `fiche_en_attente`. Les
-- privilèges (`revoke`/`grant`) survivent au remplacement sans qu'il faille les rejouer —
-- CREATE OR REPLACE FUNCTION ne change ni le propriétaire ni les droits déjà accordés
-- (vérifié en base après le remplacement de 20260818260000, et revérifié après celui-ci).
--
-- LE PIÈGE À NE PAS REFERMER, et il s'est déjà refermé dans cette phase : la ronde A a payé
-- une correction de légende qui a REMPLACÉ LE TEXTE ENTIER et emporté au passage le mode de
-- défaillance le plus dangereux, encore vrai. Ce fichier est donc une COPIE OCTET POUR OCTET
-- de 20260818260000, dont SEUL le bloc de commentaire du chemin 1 diffère ; tout ce qui y
-- était encore vrai est conservé mot pour mot — en particulier la mise en garde « NE PAS
-- croire qu'un autre geste activerait cette fiche », qui reste exacte.
create or replace function public.convertir_participant_externe(
  p_participant uuid,
  p_chemin text,
  p_membre_cible uuid,
  p_nom text,
  p_prenom text,
  p_faiseur uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean,
  p_par uuid
)
returns table (membre_id uuid, demande_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants_externes%rowtype;
  v_membre uuid;
  v_demande uuid;
  v_etat_cible public.etat_membre;
begin
  -- D67 — VERROU « ARBRE », PREMIÈRE INSTRUCTION, AVANT TOUTE LECTURE.
  -- Même clé constante (20260814, 1) que public.definir_arbre : une clé différente ne
  -- sérialiserait RIEN entre les deux, et le verrou ne servirait à rien.
  -- Le déclencheur anti-cycle seul ne suffit pas, et la 1c (§4.1) l'a établi : deux
  -- écritures concurrentes voient chacune un arbre sans cycle et valident toutes les deux.
  -- La fiche créée ici n'a aucun descendant à l'instant de son insertion, mais une
  -- transaction concurrente peut, pendant ce temps, rattacher son futur faiseur de
  -- disciple SOUS ELLE via definir_arbre sans la voir.
  -- PRIS INCONDITIONNELLEMENT, alors que seul le chemin 2 pose un faiseur de disciple :
  -- le coût est nul sur un geste rare, et une passerelle qui prend son verrou PARFOIS est
  -- une passerelle dont il faut relire le corps entier pour savoir si un appel donné est
  -- sûr.
  perform pg_advisory_xact_lock(20260814, 1);

  select * into v_participant
  from public.participants_externes x
  where x.id = p_participant
  for update;

  if not found then
    raise exception 'Participant externe inconnu.'
      using detail = 'participant_inconnu';
  end if;

  -- D63 — barrière AMONT, doublée par le déclencheur participants_externes_liens_definitifs
  -- (migration des participants externes). Ici pour EXPLIQUER avant d'écrire ; là-bas pour
  -- protéger même une écriture directe.
  if v_participant.converti_en_membre_id is not null then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  -- D62 — un participant DÉJÀ CLASSÉ SANS SUITE reste convertible, et aucune vérification
  -- ne l'en empêche ici. « Pas de réouverture » porte sur la LISTE, pas sur le sort de la
  -- personne : quelqu'un classé il y a deux ans qui reprend contact doit pouvoir être
  -- converti, et cette conversion ne repeuple aucune liste. Dit ici pour qu'on ne « corrige »
  -- pas l'absence de contrôle en croyant combler un oubli.

  if p_chemin = 'fiche_en_attente' then
    -- CHEMIN 1 — fiche en_attente destinée à rejoindre le circuit de validation de
    -- /demandes. LA GARDE EST OUVERTE À CETTE ORIGINE, ET LE CHEMIN EST DONC ACHEVABLE.
    -- ÉTAT VÉRIFIÉ CONTRE LE CODE AU MOMENT DE CETTE MIGRATION : la garde d'origine de
    -- `validerDemandeNouvellePersonne` (src/app/demandes/actions.ts:190-192) accepte les
    -- TROIS origines — `auto_inscription`, `demande_suivi` ET `conversion_participant`,
    -- ouverte par la Task 22 (D66). Éprouvé par le VRAI parcours applicatif dans
    -- tests/e2e/evenements.spec.ts (conversion depuis /evenements/a-traiter, puis clic réel
    -- sur « Valider comme nouvelle personne » de /demandes), et non par un rejeu RPC
    -- privilégié qui reproduirait les écritures au lieu de les observer.
    -- CE QUI LA FAIT PASSER À `actif`, ET C'EST LE SEUL GESTE QUI LE FASSE : le bouton
    -- « Valider comme nouvelle personne » de /demandes, servi par
    -- `validerDemandeNouvellePersonne`. Cette validation écrit `etat = 'actif'` ET RIEN
    -- D'AUTRE pour cette origine : elle ne pose AUCUN faiseur de disciple, l'administrateur
    -- qui convertit n'étant pas le faiseur de disciple de la personne convertie. Le
    -- rattachement à l'arbre se fait ensuite, depuis /membres/<id>/arbre.
    -- NE PAS croire qu'un autre geste activerait cette fiche entre-temps : `definir_arbre`
    -- n'écrit que les trois colonnes de filiation et JAMAIS `etat` ; `rejeterDemande`
    -- n'écrit que `demandes_membre.etat` et ne touche pas la fiche. La validation reste
    -- donc le PASSAGE OBLIGÉ : tant qu'elle n'a pas eu lieu, la fiche demeure `en_attente`,
    -- lisible du seul administrateur et de son demandeur, et la seconde branche de
    -- `seminaires_assistes` ne rend rien pour elle à un compte ordinaire.
    insert into public.membres (nom, prenom, telephone, email_contact, ville, pays, etat, cree_par)
    values (
      p_nom,
      p_prenom,
      v_participant.telephone,
      v_participant.email,
      v_participant.ville,
      v_participant.pays,
      'en_attente',
      p_par
    )
    returning id into v_membre;

    -- D66 — sans cette ligne, la fiche en_attente ne rejoindrait AUCUN circuit :
    -- /demandes liste des demandes, pas des fiches, et personne ne la validerait jamais.
    -- L'origine est EXPLICITE (D32), jamais inférée : réutiliser `demande_suivi`
    -- brancherait l'écran de validation sur le mauvais comportement (poser le demandeur
    -- comme faiseur de disciple, alors que l'administrateur qui convertit ne l'est pas).
    insert into public.demandes_membre (origine, demandeur_profil_id, membre_id, etat)
    values ('conversion_participant', p_par, v_membre, 'en_attente')
    returning id into v_demande;

  elsif p_chemin = 'fiche_active' then
    -- CHEMIN 2 — fiche ACTIVE directe, avec faiseur de disciple. C'est le chemin que le
    -- verrou pris plus haut protège réellement. Aucune vérification de l'état du faiseur
    -- ici : le déclencheur membres_faiseur_de_disciple_archive (20260814150000) refuse
    -- déjà un faiseur ARCHIVÉ avec le marqueur `faiseur_de_disciple_archive`, et
    -- membres_anti_cycle refuse un cycle. Dupliquer ces règles créerait deux vérités.
    insert into public.membres (
      nom, prenom, telephone, email_contact, ville, pays, etat,
      faiseur_de_disciple_id, dirigeant_id, dirigeant_force, cree_par
    )
    values (
      p_nom,
      p_prenom,
      v_participant.telephone,
      v_participant.email,
      v_participant.ville,
      v_participant.pays,
      'actif',
      p_faiseur,
      p_dirigeant,
      coalesce(p_dirigeant_force, false),
      p_par
    )
    returning id into v_membre;

  elsif p_chemin = 'membre_existant' then
    -- CHEMIN 3 — rattachement à une fiche EXISTANTE. Aucune fiche créée, aucune écriture
    -- sur membres : seul le lien du participant est posé, plus bas.
    select m.etat into v_etat_cible
    from public.membres m
    where m.id = p_membre_cible
    for update;

    if not found then
      raise exception 'Fiche cible inconnue.'
        using detail = 'membre_cible_inconnu';
    end if;

    -- D68 — `is distinct from` et non `<>` : v_etat_cible est non nul après le `if not
    -- found` ci-dessus, mais l'écrire ainsi fait dépendre la sûreté d'une EXPRESSION plutôt
    -- que d'un raisonnement qu'une retouche future pourrait invalider.
    -- Rattacher à une fiche `archive` attribuerait un séminaire à quelqu'un qui a quitté
    -- l'équipe et ferait réapparaître son nom dans des vues que l'archivage ferme ;
    -- rattacher à une fiche `en_attente` court-circuiterait le circuit de validation qui la
    -- retient. Double dispositif, comme le §7 de la spécification maîtresse le fait déjà
    -- pour le faiseur de disciple archivé : le sélecteur ne propose que des membres actifs,
    -- ET cette passerelle refuse — sans quoi un onglet resté ouvert reposterait un
    -- identifiant devenu invalide entre-temps.
    if v_etat_cible is distinct from 'actif' then
      raise exception 'La fiche choisie doit être active.'
        using detail = 'membre_cible_non_actif';
    end if;

    v_membre := p_membre_cible;

  else
    raise exception 'Chemin de conversion inconnu.'
      using detail = 'chemin_inconnu';
  end if;

  -- L'ÉCRITURE QUI FERME LA CONVERSION, dans la MÊME transaction que la création de la
  -- fiche : c'est tout l'objet de D65. Le déclencheur participants_externes_liens_definitifs
  -- laisse passer ce premier passage (old.converti_en_membre_id est NULL) et refusera tout
  -- suivant.
  update public.participants_externes
     set converti_en_membre_id = v_membre,
         converti_le = now(),
         converti_par = p_par
   where id = p_participant;

  return query select v_membre, v_demande;
end;
$$;

-- `comment on function` INCHANGÉ : il ne portait pas l'affirmation fausse (il décrit
-- l'écriture en base, pas l'état de la garde applicative), et CREATE OR REPLACE FUNCTION ne
-- l'efface pas — nul besoin de le réémettre.
