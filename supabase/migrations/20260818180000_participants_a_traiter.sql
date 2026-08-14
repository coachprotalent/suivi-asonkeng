-- Liste « à traiter » : participants externes ayant exprimé le désir d'un suivi
-- spirituel, ni convertis ni classés (spec §4.4, D74).
--
-- ⚠️ `security_invoker = true` — L'INVERSE EXACT de seminaires_assistes (D71), et c'est
-- délibéré. Cette vue n'a AUCUNE raison d'élargir quoi que ce soit : ses lecteurs
-- légitimes (administrateur, modérateur) ont déjà le droit de lire participants_externes,
-- participations et evenements. En héritant de leur RLS, elle ne peut pas fuir, et elle
-- n'a aucune politique propre à écrire ni à prouver — même forme que compteurs_ael.
-- ÉCRIRE `false` ICI OUVRIRAIT LA LISTE DES CONFIDENCES À TOUT COMPTE ACTIF. La preuve n°7
-- de tests/rls/evenements.test.ts ferme ce sens.
--
-- UN PARTICIPANT, UNE LIGNE (D61), quel que soit le nombre d'événements où il a exprimé le
-- désir : c'est ce qui rend le classement — posé sur la PERSONNE — vrai par construction,
-- et non « vrai tant qu'il n'a fréquenté qu'un séminaire ».
--
-- `group by x.id` suffit : x.id est la clé primaire de participants_externes, et Postgres
-- reconnaît la dépendance fonctionnelle des autres colonnes de x.

create view public.participants_a_traiter
  with (security_invoker = true) as
select
  x.id as participant_externe_id,
  x.nom,
  x.prenom,
  x.telephone,
  x.email,
  x.ville,
  x.pays,
  x.cree_le,
  min(e.date_debut) as premiere_expression,
  count(*) as evenements_concernes
from public.participants_externes x
join public.participations p on p.participant_externe_id = x.id
join public.evenements e on e.id = p.evenement_id
where p.desir_suivi_spirituel
  and x.converti_en_membre_id is null
  and x.classe_le is null
group by x.id;

comment on view public.participants_a_traiter is
  'Participants externes ayant exprimé le désir d''un suivi spirituel, ni convertis ni classés sans suite (spec §4.4, D74). security_invoker = TRUE, l''inverse exact de seminaires_assistes (D71) et délibérément : ses lecteurs légitimes ont déjà le droit de lire les trois tables jointes, elle hérite donc de leur RLS et ne peut pas fuir. Écrire false ici ouvrirait la liste des confidences à tout compte actif. UNE LIGNE PAR PERSONNE (D61), quel que soit le nombre d''événements concernés : c''est ce qui rend le classement, posé sur la personne, vrai par construction. Tri de pagination obligatoire : order by premiere_expression, participant_externe_id — la dernière clé est unique, sans quoi deux personnes ayant exprimé leur désir au même séminaire pourraient apparaître deux fois ou disparaître entre deux pages (D75).';

revoke all on public.participants_a_traiter from anon, authenticated;
grant select on public.participants_a_traiter to authenticated;
