-- D64 — amendement de public.annuler_demande_membre : une demande d'origine
-- `conversion_participant` n'est PAS annulable.
--
-- LE SINISTRE FERMÉ ICI. L'annulation (D42, phase 2b) SUPPRIME la fiche en_attente que la
-- demande portait. Une conversion par le chemin 1 pointe SUR CETTE FICHE, et
-- l'administrateur convertisseur EST le demandeur : le bouton « Annuler » s'affiche pour
-- lui dans « Mes demandes ». Sans barrière, un clic déconvertirait le participant — fiche
-- disparue, historique de séminaire perdu, retour dans la liste « à traiter », aucune
-- erreur nulle part.
--
-- DEUX BARRIÈRES, pas une. (1) participants_externes.converti_en_membre_id est en
-- `on delete restrict` : le `delete from membres` plus bas échouerait en 23503, ce qui
-- annulerait TOUTE la transaction — y compris le passage à `annulee` déjà écrit, Postgres
-- n'ayant pas de transaction autonome. (2) Le refus explicite ci-dessous EXPLIQUE, au lieu
-- de laisser remonter un 23503 opaque, et couvre aussi le cas d'une conversion faite par
-- un chemin qui ne crée pas de fiche (chemin 3).
--
-- `create or replace` dans une migration NEUVE : l'additivité du projet porte sur les
-- FICHIERS, pas sur l'immuabilité d'une fonction. Le corps ci-dessous REPREND À
-- L'IDENTIQUE celui de 20260815250000, avec la SEULE addition du refus et de la lecture de
-- `origine` qu'il exige.

create or replace function public.annuler_demande_membre(
  p_demande uuid,
  p_demandeur uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
  v_origine public.origine_demande;
begin
  -- Verrou DE LIGNE : cette demande précise, pas l'arbre ni les comptes. La condition
  -- WHERE porte à la fois sur la propriété et sur l'état : une demande inexistante,
  -- appartenant à quelqu'un d'autre, ou déjà traitée produit le MÊME refus.
  select d.membre_id, d.origine into v_membre, v_origine
  from public.demandes_membre d
  where d.id = p_demande
    and d.demandeur_profil_id = p_demandeur
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut plus être annulée.'
      using detail = 'demande_non_annulable';
  end if;

  -- D64 — LE REFUS AJOUTÉ PAR CETTE MIGRATION, avant toute écriture.
  if v_origine = 'conversion_participant' then
    raise exception 'Une demande issue d''une conversion de participant ne peut pas être annulée.'
      using detail = 'demande_conversion_non_annulable';
  end if;

  update public.demandes_membre
     set etat = 'annulee',
         traite_par = p_demandeur,
         traite_le = now()
   where id = p_demande;

  -- D42 (phase 2b) : suppression de la fiche en_attente. membre_id de CETTE ligne devient
  -- NULL automatiquement (on delete set null) : la demande survit, la référence ne pointe
  -- plus vers rien. GARDE : `and etat = 'en_attente'` — cette fonction ne doit JAMAIS
  -- supprimer une fiche qui ne serait plus la fiche jetable d'origine.
  if v_membre is not null then
    delete from public.membres where id = v_membre and etat = 'en_attente';
  end if;

  -- D41 (phase 2b) : les notifications déjà envoyées aux administrateurs POUR CETTE
  -- DEMANDE sont marquées lues. Filtre sur demande_id (corrélation explicite, migration
  -- 20260815240000), PAS sur lien, qui n'est qu'un lien de navigation.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and demande_id = p_demande
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42, phase 2b), dans une transaction unique. La suppression de la fiche est gardée par etat = ''en_attente''. Marque lues les notifications nouvelle_demande dont demande_id correspond (D41, phase 2b). AMENDÉE PAR LA PHASE 4 (D64) : refuse une demande d''origine conversion_participant avec le marqueur demande_conversion_non_annulable — l''annuler déconvertirait silencieusement le participant, ferait disparaître sa fiche, perdrait son historique de séminaire et le ferait réapparaître dans la liste « à traiter ». Seconde barrière indépendante : participants_externes.converti_en_membre_id est en on delete restrict, donc le delete échouerait de toute façon en 23503, annulant la transaction entière. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
