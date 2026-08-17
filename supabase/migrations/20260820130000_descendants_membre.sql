-- Phase 7, D141 / D148 — le miroir DESCENDANT de public.ancetres_membre.
--
-- ═══ ELLES RENDENT DES IDENTIFIANTS, JAMAIS DES NOMS (D141) ═══
-- C'est la règle D93/D98 établie par /arborescence, reprise telle quelle et non réinventée :
-- la FORME de l'arbre est lue AFFRANCHIE DE LA RLS (security definer), parce qu'une lecture
-- soumise à la RLS s'arrêterait au premier maillon invisible et FERAIT MENTIR L'ÉCRAN sur la
-- profondeur ; les NOMS, eux, sont relus SOUS RLS par l'application (`nomsMaillonsActifs`).
-- AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT L'ÉCRAN. Ces fonctions ne peuvent pas garantir
-- cela seules — c'est l'appelant qui en répond — mais elles ne le trahissent pas : elles
-- n'exposent aucun nom. `nom` et `prenom` servent AU TRI et ne sont pas projetés ; trier sur
-- une colonne ne l'expose pas.
--
-- ═══ LE FILTRE `etat = 'actif'` PORTE SUR LES LIGNES RENDUES, ET NON SUR LE PARCOURS ═══
-- Le `join` filtrant vit dans `filtree`, APRÈS la récursion, et NON dans le terme récursif
-- de `branche`. C'est la sémantique correcte : le parcours décrit la FORME de l'arbre, le
-- filtre décide de ce qu'on AFFICHE.
--
-- ⚠️ ET CE CHOIX EST AUJOURD'HUI INERTE — IL FAUT LE DIRE, PAS LE DRAMATISER.
-- La rédaction initiale de ce fichier annonçait que déplacer le filtre dans `branche`
-- « amputerait la branche sous le premier membre archivé, dont les disciples actifs
-- disparaîtraient sans le moindre signal ». MESURÉ CONTRE CETTE BASE, c'est FAUX : cet état
-- est INATTEIGNABLE. Deux déclencheurs maintiennent l'invariant « un membre non actif n'a
-- jamais de disciple actif », et ils se referment l'un l'autre :
--
--   • archiver un membre qui a encore des disciples actifs est REFUSÉ
--     (marqueur `disciples_a_reaffecter` ; message mesuré : « Ce membre est encore faiseur
--     de disciple de 1 personne(s) active(s). ») ;
--   • rétablir un membre dont le faiseur de disciple est archivé est REFUSÉ
--     (`membres_faiseur_de_disciple_archive`, migration 20260814140000) ;
--   • rattacher un disciple à un faiseur non actif est REFUSÉ par `public.definir_arbre`
--     (`faiseur_de_disciple_inactif`, migration 20260819100000).
--
-- Tout ancêtre d'un membre actif est donc lui-même actif, et les deux emplacements du filtre
-- rendent AUJOURD'HUI exactement le même résultat. Le placement retenu est celui qui reste
-- juste si cet invariant venait à être assoupli — mais il ne protège, à ce jour, contre
-- aucun défaut atteignable. `tests/rls/descendants.test.ts` éprouve donc L'INVARIANT
-- lui-même, plutôt que de mettre en scène un état que la base interdit.
--
-- ═══ LA PAGINATION EST EN SQL, PAS DANS L'APPLICATION (D148) ═══
-- Une fonction `returns table` appelée par `rpc` est soumise au plafond `max_rows` de
-- PostgREST (1000, supabase/config.toml) EXACTEMENT COMME une lecture de table. Rendre toute
-- la descendance puis la découper côté application la ferait TRONQUER EN SILENCE au millième
-- descendant — le mode de défaillance que la pagination existe pour fermer. `p_limite` est
-- bornée à 500 ICI, dans la fonction : une borne posée côté application ne protégerait pas
-- d'un autre appelant.
--
-- LE TOTAL PAR `count(*) over ()` : une seule passe, pas de seconde récursion. Une page VIDE
-- (décalage au-delà de la fin) ne porte aucune ligne, donc aucun total — d'où le repli
-- public.compter_descendants ci-dessous. Même partage que disciplesParPage/compterDisciples,
-- et même interdiction : ce repli ne doit JAMAIS servir à pré-calculer une borne en amont,
-- ce qui rouvrirait la fenêtre de course refermée par la ronde I1 du 2026-08-14.
--
-- PARCOURS BORNÉ À 64 NIVEAUX, comme public.ancetres_membre et public.chemin_arbre. Le
-- déclencheur membres_anti_cycle garantit déjà l'absence de cycle : cette borne est une
-- ceinture, pas la bretelle.
--
-- TRI TOTAL : (profondeur, nom, prenom, id). `(profondeur, nom, prenom)` n'est PAS unique —
-- deux homonymes exacts au même niveau, à cheval sur une frontière de page, seraient rendus
-- DEUX FOIS ou JAMAIS. Sur une liste de membres d'église, les homonymes ne sont pas une
-- hypothèse d'école ; c'est le défaut déjà corrigé sur `membresDesAntennesParLots`.

create or replace function public.descendants_membre(
  p_membre uuid,
  p_profondeur_min integer default 1,
  p_decalage integer default 0,
  p_limite integer default 25
)
returns table (membre_id uuid, parent_id uuid, profondeur integer, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive branche as (
    select m.id, m.faiseur_de_disciple_id as parent, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, b.profondeur + 1
    from public.membres m
    join branche b on m.faiseur_de_disciple_id = b.id
    where b.profondeur < 64
  ),
  filtree as (
    -- ⚠️ LE FILTRE D'ÉTAT EST ICI, APRÈS LA RÉCURSION, ET PAS DANS `branche`. Voir
    -- l'encadré en tête de fichier : le déplacer amputerait la branche sous un archivé,
    -- et ses disciples actifs disparaîtraient sans le moindre signal.
    select b.id, b.parent, b.profondeur, m.nom, m.prenom
    from branche b
    join public.membres m on m.id = b.id
    where b.profondeur >= greatest(coalesce(p_profondeur_min, 1), 1)
      and m.etat = 'actif'
  )
  select f.id, f.parent, f.profondeur, count(*) over () as total
  from filtree f
  order by f.profondeur, f.nom, f.prenom, f.id
  offset greatest(coalesce(p_decalage, 0), 0)
  limit least(greatest(coalesce(p_limite, 25), 1), 500);
$$;

comment on function public.descendants_membre(uuid, integer, integer, integer) is
  'Phase 7, D141/D148. Descendants ACTIFS d''un membre dans l''arbre des faiseurs de disciple, le membre lui-même exclu (p_profondeur_min >= 1), avec le parent et la profondeur de chacun. Rend des IDENTIFIANTS et JAMAIS des noms : la forme de l''arbre est lue affranchie de la RLS, les noms sont relus sous RLS par l''application via nomsMaillonsActifs — nom et prenom servent ici au TRI et ne sont pas projetés. LE FILTRE etat = actif PORTE SUR LES LIGNES RENDUES ET NON SUR LE PARCOURS : les disciples actifs d''un membre archivé sont donc bien rendus, filtrer le parcours amputerait la branche sans le moindre signal. Paginée EN SQL (p_decalage, p_limite bornée à 500 dans la fonction) parce qu''un rpc est soumis au plafond max_rows de PostgREST comme une lecture de table, et qu''une troncature y serait silencieuse. Le total est rendu par count(*) over () ; une page vide n''en porte aucun, d''où le repli public.compter_descendants. Parcours borné à 64 niveaux, comme ancetres_membre. Tri total (profondeur, nom, prenom, id) : les homonymes exacts à cheval sur une frontière de page seraient sinon rendus deux fois ou jamais. Exécution réservée à service_role.';

-- Repli de `descendants_membre` quand sa page est VIDE et ne porte donc aucun total.
-- JAMAIS appelée EN AMONT pour pré-calculer une borne : ce serait ouvrir la fenêtre de
-- course que la ronde I1 du 2026-08-14 a refermée sur `disciplesParPage`.
--
-- Les règles de parcours et de filtrage sont RIGOUREUSEMENT celles de la fonction ci-dessus.
-- Une divergence entre les deux ferait annoncer à l'écran un total qui ne correspond à
-- aucune page atteignable — le nombre de pages calculé serait faux, et la dernière page
-- resterait vide sans explication.
create or replace function public.compter_descendants(
  p_membre uuid,
  p_profondeur_min integer default 1
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with recursive branche as (
    select m.id, m.faiseur_de_disciple_id as parent, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, b.profondeur + 1
    from public.membres m
    join branche b on m.faiseur_de_disciple_id = b.id
    where b.profondeur < 64
  )
  select count(*)
  from branche b
  join public.membres m on m.id = b.id
  where b.profondeur >= greatest(coalesce(p_profondeur_min, 1), 1)
    and m.etat = 'actif';
$$;

comment on function public.compter_descendants(uuid, integer) is
  'Phase 7, D148. Nombre de descendants ACTIFS d''un membre, avec des règles de parcours et de filtrage RIGOUREUSEMENT identiques à celles de public.descendants_membre — une divergence ferait annoncer un total ne correspondant à aucune page atteignable. Sert de REPLI quand une page de descendants_membre est vide et ne porte donc aucun total ; jamais à pré-calculer une borne en amont, ce qui rouvrirait une fenêtre de course. Exécution réservée à service_role.';

revoke execute on function public.descendants_membre(uuid, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.compter_descendants(uuid, integer) from public, anon, authenticated;
grant execute on function public.descendants_membre(uuid, integer, integer, integer) to service_role;
grant execute on function public.compter_descendants(uuid, integer) to service_role;
