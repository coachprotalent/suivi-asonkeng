-- Parcours de l'arbre, pour la portée d'autorité (spec §5.1) et pour l'affichage du
-- chemin fautif d'un cycle (spec §7).

-- Ancêtres d'un membre, du plus proche au plus lointain. Le membre lui-même est
-- EXCLU : nul n'est son propre ancêtre, et l'inclure donnerait à chacun autorité sur
-- lui-même — ce que la spec ne prévoit pas (§5.1 parle d'ancêtre ou de dirigeant).
create or replace function public.ancetres_membre(p_membre uuid)
returns table (membre_id uuid, profondeur int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select c.id, c.profondeur from chaine c where c.profondeur > 0 order by c.profondeur;
$$;

comment on function public.ancetres_membre(uuid) is
  'Ancêtres d''un membre dans l''arbre des faiseurs de disciple, du plus proche au plus lointain, le membre lui-même exclu. Parcours borné à 64 niveaux.';

-- Le chemin complet, membre inclus, avec les noms : sert à MONTRER à un administrateur
-- pourquoi un rattachement est refusé.
create or replace function public.chemin_arbre(p_membre uuid)
returns table (membre_id uuid, nom text, prenom text, profondeur int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.nom, m.prenom, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.nom, m.prenom, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select c.id, c.nom, c.prenom, c.profondeur from chaine c order by c.profondeur;
$$;

comment on function public.chemin_arbre(uuid) is
  'Chemin complet, membre inclus, du plus proche au plus lointain, avec noms et prénoms : sert à afficher à un administrateur pourquoi un rattachement est refusé. Parcours borné à 64 niveaux.';

revoke execute on function public.ancetres_membre(uuid) from public, anon, authenticated;
revoke execute on function public.chemin_arbre(uuid) from public, anon, authenticated;
grant execute on function public.ancetres_membre(uuid) to service_role;
grant execute on function public.chemin_arbre(uuid) to service_role;

-- Correction de commentaire issue de la revue de la Task 1 : migration additive, la
-- 20260814100000 est déjà appliquée et ne se réécrit pas. `comment on function` crée
-- ou remplace, sans dépendre d'un commentaire préexistant.
--
-- Le déclencheur `membres_anti_cycle` et sa fonction `prive.refuser_cycle_faiseur_de_disciple`
-- n'avaient encore aucun commentaire propre : l'affirmation « barrière de dernier
-- recours, y compris pour une écriture directe », posée en 20260814100000, est un
-- commentaire de LIGNE sur l'objet, invisible à `obj_description`. Elle est vraie
-- écriture par écriture, fausse pour une écriture MULTI-LIGNES en une seule instruction :
-- un déclencheur `before ... for each row` évalue chaque ligne sans voir les autres
-- lignes que la même commande modifie.
comment on function prive.refuser_cycle_faiseur_de_disciple() is
  'Déclencheur before insert or update of faiseur_de_disciple_id sur public.membres : refuse tout rattachement qui fermerait un cycle dans l''arbre des faiseurs de disciple, pour une écriture ligne à ligne, y compris hors de la passerelle public.definir_arbre. Limite assumée : un insert ou upsert MULTI-LIGNES en une seule instruction lui échappe, un déclencheur for each row ne voyant pas les autres lignes modifiées par la même commande. Aucun code applicatif n''émet aujourd''hui une telle écriture.';
