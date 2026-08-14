-- Vue des séminaires assistés (spec §4.4, D2, D16, D69, D70, D71, D72, D73).
--
-- ⚠️ `security_invoker = false` — ÉCRIT, PAS LAISSÉ AU DÉFAUT, ET SURTOUT PAS « CORRIGÉ »
-- EN `true`. C'est la SEULE vue du projet qui contourne délibérément la RLS, et c'est sa
-- raison d'être : le §4.4 la veut lisible de TOUT COMPTE ACTIF alors que participations
-- est fermée à l'administrateur et au modérateur (§5.3, D23). Aucune politique de ligne ne
-- peut produire cela — la RLS est ligne à ligne, le partage à faire ici est colonne à
-- colonne. Le principe de la phase 3 (§4.5) interdit d'élargir SILENCIEUSEMENT ; ce fichier
-- est le contraire d'un silence.
--
-- CE QUE PRODUIRAIT `true` : zéro ligne pour tout compte ordinaire, et les étiquettes de
-- séminaires disparaissant de TOUTES les fiches membres — sans la moindre erreur. Défaut
-- invisible, en échec fermé, exactement celui que le §5.3 décrit pour prive.est_admin().
-- La preuve n°5 de tests/rls/evenements.test.ts le ferme, et elle seule.
--
-- La vue repose sur l'hypothèse BYPASSRLS de son PROPRIÉTAIRE, déjà documentée au §5.3
-- pour prive.est_admin() et vérifiée empiriquement sur ce projet. Toute modification
-- future du propriétaire doit s'accompagner du même test.
--
-- LA RLS DE `membres` EST RÉIMPOSÉE par prive.peut_lire_membre (D72) : contourner celle de
-- participations contourne DU MÊME GESTE celle de membres. `auth.uid()` continue de
-- désigner l'APPELANT à l'intérieur de la vue — elle contourne la RLS, pas l'identité.
--
-- CINQ COLONNES, exactement celles du §4.4. Aucune colonne de désir, aucune note, aucun
-- nom de participant externe, aucune trace du fait qu'il y ait eu conversion (D73).

create view public.seminaires_assistes
  with (security_invoker = false) as
select
  p.membre_id,
  e.id as evenement_id,
  e.titre,
  t.libelle as type,
  e.date_debut
from public.participations p
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where p.membre_id is not null
  and prive.peut_lire_membre(p.membre_id)

-- `union` ET NON `union all` (D70) : rien n'empêche une même personne de figurer à un
-- événement à la fois comme membre et comme externe converti — les deux index partiels de
-- D58 sont AVEUGLES L'UN À L'AUTRE, et aucune contrainte ne peut savoir que deux lignes
-- désignent le même être humain. La déduplication est la seule réponse honnête, et elle
-- est gratuite.
union

-- SECONDE BRANCHE — sans elle, D69 coûterait exactement ce que la question de conception
-- redoutait : UN CONVERTI PERDRAIT L'HISTORIQUE DE SA PARTICIPATION, la vue lisant
-- membre_id sur une ligne qui restera éternellement NULL. Avec elle, l'historique se
-- reconstitue À LA LECTURE sans qu'aucune écriture passée n'ait bougé.
select
  x.converti_en_membre_id,
  e.id,
  e.titre,
  t.libelle,
  e.date_debut
from public.participations p
join public.participants_externes x on x.id = p.participant_externe_id
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where x.converti_en_membre_id is not null
  and prive.peut_lire_membre(x.converti_en_membre_id);

comment on view public.seminaires_assistes is
  'Séminaires assistés par un membre, lisibles de TOUT COMPTE ACTIF (spec §4.4, D2, D16). SEULE VUE DU PROJET EN security_invoker = false (D71), écrit explicitement et non laissé au défaut : elle contourne délibérément la RLS de participations, fermée à l''administrateur et au modérateur, parce que le partage à faire est colonne à colonne là où la RLS est ligne à ligne. Elle NE contourne PAS la RLS de membres : prive.peut_lire_membre (D72) la réimpose, une seule définition partagée avec la politique membres_lecture. auth.uid() continue de désigner l''appelant. Union et non union all (D70) : une même personne peut figurer à un événement comme membre ET comme externe converti. CINQ COLONNES, aucune ne portant un désir, une note ou une identité externe (D73) — une colonne ajoutée un jour « pour la commodité » serait attrapée par l''assertion sur information_schema.columns de tests/rls/evenements.test.ts. MODE DE DÉFAILLANCE À CONNAÎTRE : si l''hypothèse BYPASSRLS du propriétaire était fausse, cette vue ne lèverait AUCUNE erreur — elle rendrait zéro ligne pour tout le monde et les étiquettes disparaîtraient sans trace.';

revoke all on public.seminaires_assistes from anon, authenticated;
grant select on public.seminaires_assistes to authenticated;
