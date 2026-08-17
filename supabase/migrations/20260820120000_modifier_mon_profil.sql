-- Phase 7, D137 / D138 / D140 — LE PREMIER CHEMIN D'ÉCRITURE NON ADMINISTRATEUR DU PROJET.
--
-- ═══ CE QUI CHANGE, ET CE QUI NE CHANGE PAS ═══
-- Ce qui NE change PAS : aucune politique d'écriture RLS n'est ouverte, ici ni ailleurs
-- (D140). Le socle du projet n'en compte AUCUNE, sur aucune table ; toutes les écritures
-- passent par des Server Actions et la clé de service. Cette migration ne fait pas exception.
-- Ce qui CHANGE : le garde applicatif de CETTE écriture-ci est `exigerProfilActif` et non
-- `exigerAdministrateur`. C'est exactement ce point que la revue de ce lot doit examiner.
--
-- ═══ LA SIGNATURE EST LA LISTE BLANCHE (D137) ═══
-- Sept paramètres, dont SIX colonnes. Ce n'est pas une commodité d'appel : c'est la
-- fermeture elle-même. Un `update` applicatif ne garantit la liste des colonnes écrites que
-- par relecture du code, et une clé ajoutée un jour à l'objet passé à `.update()` écrirait
-- la colonne correspondante sans que rien ne s'y oppose. Une signature typée ne PEUT PAS
-- écrire une huitième colonne.
--
-- CE QUI RESTE FERMÉ, ET QUI N'EST DONC PAS UN PARAMÈTRE (D138) : nom, prenom, antenne_id,
-- faiseur_de_disciple_id, dirigeant_id, dirigeant_force, contact_id, report_initial_ael,
-- etat, cree_par, ET TOUTE colonne de public.profils (identifiant, nom_affichage, est_racine,
-- actif, membre_id), ET TOUTE ligne de public.roles_profil.
--
-- LE NOM D'AFFICHAGE A ÉTÉ RETIRÉ DE CETTE LISTE PAR L'UTILISATEUR, EN CONNAISSANCE DE
-- CAUSE : `journal_statuts.par_nom_affichage` fige le nom de l'auteur au moment de l'écriture
-- (migration 20260813160000), et laisser chacun le choisir librement permettrait de signer
-- ses futurs mouvements du nom de quelqu'un d'autre. L'écran l'AFFICHE, il ne l'édite pas.
--
-- ═══ p_profil VIENT DE LA SESSION, JAMAIS DU FORMULAIRE ═══
-- La passerelle FAIT CONFIANCE à son appelant sur ce seul point : appelée avec le profil
-- d'un autre compte, elle modifierait la fiche de cet autre compte. C'est la Server Action
-- `modifierMonProfil` qui garantit la provenance, en passant `profil.id` issu de
-- `exigerProfilActif`. Cette frontière est DOCUMENTÉE PAR UNE PREUVE
-- (tests/rls/profil-personnel.test.ts) plutôt que laissée implicite. Elle tient parce que
-- l'exécution est réservée à `service_role` : aucun compte `authenticated` ne peut appeler
-- cette fonction, quel que soit le `p_profil` qu'il forgerait.
--
-- LA FICHE VISÉE EST RÉSOLUE ICI, PAS REÇUE. `membre_id` est lu depuis public.profils, à
-- l'intérieur de la fonction. Le recevoir en paramètre rouvrirait par une autre porte
-- exactement ce que le paragraphe précédent ferme : il suffirait alors de passer le bon
-- `p_profil` et un `p_membre` arbitraire.
--
-- `p.actif` EST VÉRIFIÉ, en défense en profondeur : `exigerProfilActif` filtre déjà les
-- comptes désactivés côté application, mais cette fonction ne s'appuie pas dessus. Désactiver
-- un compte ne révoque pas son jeton — c'est le motif même du filtre `actif` de
-- `profilCourant`, et il vaut ici aussi.
--
-- LE `case` SUR LE DOMAINE D'ÉTUDE N'EST PAS UNE REDITE de la normalisation applicative :
-- public.membres porte la contrainte `membres_domaine_reserve_etudiant`, et une valeur non
-- nulle hors situation étudiante ferait lever un 23514 dont `error.details` porterait
-- « Failing row contains (…) » — LA FICHE ENTIÈRE. On ne s'appuie pas sur l'appelant pour
-- éviter ça : la règle est tenue des deux côtés, et c'est le côté base qui fait foi.

create or replace function public.modifier_mon_profil(
  p_profil uuid,
  p_telephone text,
  p_email_contact text,
  p_ville text,
  p_pays text,
  p_situation public.situation_membre,
  p_domaine_etude text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
begin
  select p.membre_id into v_membre
  from public.profils p
  where p.id = p_profil and p.actif;

  -- Un profil sans fiche (compte racine, contrainte profils_racine_sans_membre), un profil
  -- désactivé, ou un identifiant qui ne correspond à aucun profil. On LÈVE plutôt que de
  -- laisser l'update ne toucher aucune ligne : UN GESTE SANS EFFET NE DOIT PAS PASSER POUR
  -- UN SUCCÈS — même discipline que prive.retirer_statut et que changerEtatMembre.
  if v_membre is null then
    raise exception 'Ce compte n''a pas de fiche membre modifiable.'
      using detail = 'profil_sans_membre';
  end if;

  update public.membres m
  set telephone = p_telephone,
      email_contact = p_email_contact,
      ville = p_ville,
      pays = p_pays,
      situation = p_situation,
      domaine_etude = case when p_situation = 'etudiant' then p_domaine_etude else null end
  where m.id = v_membre;

  -- La fiche a disparu entre la lecture du profil et l'écriture. Improbable — profils.membre_id
  -- est en `on delete set null`, donc une fiche supprimée laisserait v_membre à null au tour
  -- SUIVANT, mais pas pendant celui-ci. Traité quand même, et jamais en silence.
  if not found then
    raise exception 'Fiche membre introuvable.'
      using detail = 'membre_inconnu';
  end if;

  return v_membre;
end;
$$;

comment on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) is
  'Phase 7, D137. Laisse un compte modifier LUI-MÊME les six seules colonnes de sa propre fiche que D138 ouvre : téléphone, adresse de contact, ville, pays, situation, domaine d''étude. LA SIGNATURE EST LA LISTE BLANCHE : tout le reste — nom, prénom, antenne, place dans l''arbre, contact, report AEL, état, et toute colonne de profils ou de roles_profil — n''est pas un paramètre et ne peut donc pas être écrit par cette voie. Le nom d''affichage en a été retiré par décision de l''utilisateur, journal_statuts.par_nom_affichage figeant le nom de l''auteur à chaque écriture. LA FICHE VISÉE EST RÉSOLUE depuis public.profils à l''intérieur de la fonction, jamais reçue en paramètre. p_profil doit venir de la session de l''appelant : la fonction fait confiance à son appelant sur ce seul point, ce que rend acceptable la réservation de son exécution à service_role. Le profil doit être ACTIF, vérifié ici en défense en profondeur — désactiver un compte ne révoque pas son jeton. Lève avec detail = profil_sans_membre (profil inconnu, désactivé, ou sans fiche) et membre_inconnu (fiche disparue entre la lecture et l''écriture) : un geste sans effet ne passe jamais pour un succès. Le case sur le domaine d''étude tient la contrainte membres_domaine_reserve_etudiant sans dépendre de la normalisation applicative.';

revoke execute on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) from public, anon, authenticated;
grant execute on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) to service_role;
