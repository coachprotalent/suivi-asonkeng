-- Phase 5, D99 / D83 — CORRECTIF sur du code DÉPLOYÉ, strictement additif.
--
-- DEUX DÉFAUTS FERMÉS ICI, tous deux vérifiés dans la migration 20260814150000 et non
-- dans sa description.
--
-- 1. LA GARDE D'ÉTAT NE CONNAISSAIT QUE `archive`, alors que public.etat_membre a TROIS
--    valeurs (20260812120000). Rien n'interdisait de rattacher un membre ACTIF à un
--    faiseur `en_attente`. Or l'arborescence de la phase 5 exclut `en_attente`
--    EXACTEMENT comme `archive` : un tel maillon rendrait toute sa descendance active
--    INATTEIGNABLE depuis la liste des racines — ces fiches ont un faiseur, donc ne sont
--    pas racines, et leur parent n'est jamais rendu. Elles disparaissent sans signal.
--    Forme reprise de convertir_participant_externe (20260818220000), qui écrit déjà
--    `if v_etat_cible is distinct from 'actif'` : `is distinct from` et non `<>`, pour
--    que la sûreté dépende d'une EXPRESSION et non d'un raisonnement sur la nullité
--    qu'une retouche future invaliderait.
--
-- 2. L'ÉTAT DU FAISEUR ÉTAIT LU SANS VERROU DE LIGNE. Le verrou consultatif
--    pg_advisory_xact_lock(20260814, 1) sérialise les écritures d'ARBRE entre elles ;
--    il ne dit RIEN de l'archivage, qui passe par un `update` PostgREST direct
--    (archiverMembre) et ne peut pas prendre de verrou consultatif sans créer un chemin
--    d'écriture de plus. En `read committed`, un rattachement et un archivage concurrents
--    ne se voyaient donc pas : le rattachement lisait `actif` (l'archivage n'était pas
--    encore commis), l'archivage comptait 0 disciple actif (le rattachement non plus), et
--    LES DEUX VALIDAIENT — laissant un membre actif sous un faiseur archivé. C'est la
--    classe de défaut que la 1c a explicitement jugée inacceptable (« deux transactions
--    voient chacune un arbre sans cycle et valident toutes les deux »).
--
--    `for share` referme les DEUX SENS : il conflit avec le FOR NO KEY UPDATE que prend
--    tout `update … set etat`. Archivage d'abord : la lecture attend, puis relit la
--    version la PLUS RÉCENTE de la ligne et refuse. Rattachement d'abord : l'archivage
--    attend, puis rejoue son déclencheur `before update` et RECOMPTE les disciples.
--    LA SECONDE MOITIÉ EST MESURÉE, PAS SUPPOSÉE : voir le rapport de tâche.
--
-- MARQUEUR NOUVEAU, ET IL NE POUVAIT PAS ÊTRE `faiseur_de_disciple_archive` :
-- ce marqueur-là commande un message affiché qui dit « est archivé ». Le rendre pour un
-- faiseur `en_attente` afficherait à l'utilisateur une phrase que le code ne tient pas.
-- D'où `faiseur_de_disciple_inactif`, distinct, pour ce cas et pour lui seul. Les deux
-- branches existent donc côte à côte, et l'ordre compte : `archive` est testé D'ABORD,
-- pour que toutes les branches applicatives qui discriminent aujourd'hui
-- `faiseur_de_disciple_archive` continuent de recevoir EXACTEMENT ce qu'elles recevaient.
--
-- CONSÉQUENCE ASSUMÉE : desarchiverMembre et /membres/[id]/arbre ne connaissent pas le
-- marqueur nouveau et ne sont pas modifiés — ils retombent sur leur message générique, et
-- le marqueur reste journalisé. Le cas n'est atteignable qu'en forgeant un appel, les
-- sélecteurs ne proposant que des membres actifs. De même, la validation d'une demande
-- `demande_suivi` dont le demandeur porterait une fiche non active échouerait désormais
-- avec ce marqueur au lieu de rattacher : refus FERMÉ, message générique, marqueur
-- journalisé — préférable à un trou muet dans l'arbre.

create or replace function public.definir_arbre(
  p_membre uuid,
  p_faiseur_de_disciple uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  -- PREMIÈRE instruction, avant toute lecture : voir l'en-tête de 20260814100000.
  -- Clé (20260814, 1) = arbre. La clé (20260814, 2) est réservée aux rôles.
  perform pg_advisory_xact_lock(20260814, 1);

  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.' using detail = 'membre_inconnu';
  end if;

  if p_faiseur_de_disciple is not null then
    -- `for share` : voir l'en-tête, point 2. Il ne bloque pas deux rattachements
    -- concurrents sous le MÊME faiseur (deux verrous partagés sont compatibles) ; il ne
    -- bloque que ce qui change la ligne du faiseur — c'est-à-dire exactement ce qui peut
    -- rendre cette lecture périmée.
    select m.etat into v_etat_faiseur
    from public.membres m
    where m.id = p_faiseur_de_disciple
    for share;
    if not found then
      raise exception 'Faiseur de disciple inconnu.' using detail = 'faiseur_inconnu';
    end if;
    if v_etat_faiseur = 'archive' then
      raise exception 'Le faiseur de disciple choisi est archivé.'
        using detail = 'faiseur_de_disciple_archive';
    end if;
    if v_etat_faiseur is distinct from 'actif' then
      raise exception 'Le faiseur de disciple choisi n''est pas un membre actif.'
        using detail = 'faiseur_de_disciple_inactif';
    end if;
  end if;

  if p_dirigeant is not null then
    perform 1 from public.membres m where m.id = p_dirigeant;
    if not found then
      raise exception 'Dirigeant inconnu.' using detail = 'dirigeant_inconnu';
    end if;
  end if;

  -- Affectation DIRECTE et non `coalesce` : contrairement à `attribuer_statut`, un
  -- `null` veut dire ici « détacher », pas « ne change pas ». Détacher un membre pour
  -- en faire une racine de l'arbre est une opération légitime et prévue par la spec
  -- (« NULL pour les racines de l'arbre »). Le `coalesce` de la 1b avait justement
  -- rendu l'effacement volontaire impossible ; on ne reproduit pas ce choix là où
  -- l'effacement est un usage normal.
  update public.membres
     set faiseur_de_disciple_id = p_faiseur_de_disciple,
         dirigeant_id = p_dirigeant,
         dirigeant_force = p_dirigeant_force
   where id = p_membre;
end;
$$;

comment on function public.definir_arbre(uuid, uuid, uuid, boolean) is
  'Passerelle sérialisée (verrou consultatif 20260814,1) vers l''écriture de l''arbre des faiseurs de disciple et du dirigeant. Refuse un membre, un faiseur de disciple ou un dirigeant inconnu, et un cycle. AMENDÉE PAR LA PHASE 5 (D99, D83) sur DEUX points. (1) La garde d''état ne connaissait que ''archive'' alors que public.etat_membre a trois valeurs : un faiseur ''en_attente'' était accepté, et rendait toute sa descendance active inatteignable depuis les racines de l''arborescence, qui exclut ''en_attente'' comme ''archive''. Un faiseur archivé rend toujours faiseur_de_disciple_archive ; un faiseur ni actif ni archivé rend le marqueur NOUVEAU faiseur_de_disciple_inactif — distinct, parce que le message commandé par le premier dit « est archivé » et mentirait ici. (2) L''état du faiseur est désormais lu SOUS VERROU DE LIGNE (for share) : le verrou consultatif sérialise les écritures d''arbre entre elles mais ne dit rien de l''archivage, qui passe par un update PostgREST direct et ne peut pas prendre de verrou consultatif ; sans for share, un rattachement et un archivage concurrents ne se voyaient pas et validaient tous les deux, laissant un membre actif sous un faiseur archivé. Exécution réservée à service_role.';
