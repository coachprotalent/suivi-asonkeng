-- Phase 7, D130 / D131 / D132 — la troisième relation de la fiche membre.
--
-- Le contact répond à « qui a une bonne relation avec cette personne ? », en plus du
-- faiseur de disciple et du dirigeant. C'est une COLONNE ORDINAIRE DE LA FICHE, pas une
-- relation d'arbre (D130) : elle est écrite par le même `update` que le téléphone et la
-- ville, jamais par `public.definir_arbre`, qui prend le verrou consultatif anti-cycle
-- `pg_advisory_xact_lock(20260814, 1)` et incarne la filiation. L'y glisser affirmerait que
-- le contact est de l'arbre, ce qui est faux.
--
-- AUCUN DÉCLENCHEUR ANTI-CYCLE, ET C'EST UN CHOIX (D131). Le contact n'est pas
-- hiérarchique : que A soit le contact de B ET B celui de A est légitime et attendu. Aucune
-- fonction récursive du projet ne parcourt cette colonne — `public.ancetres_membre`,
-- `public.chemin_arbre` et `public.descendants_membre` (phase 7, lot C) ne suivent que
-- `faiseur_de_disciple_id`. Seul le cas dégénéré est fermé, par la contrainte ci-dessous.
--
-- AUCUNE MODIFICATION DE RLS (D132). `membres_lecture` n'est pas touchée : le contact ne
-- confère AUCUN droit et AUCUNE lecture élargie. Décision de l'utilisateur, prise une fois
-- établi que la politique ouvre DÉJÀ toutes les fiches actives à tout compte actif — une
-- « lecture élargie » n'aurait donc rien changé sur une fiche active, et n'aurait ajouté que
-- la visibilité des fiches archivées et en attente.
--
-- `on delete set null`, comme `faiseur_de_disciple_id` et `dirigeant_id` (20260812120000) :
-- la suppression d'une fiche ne doit pas échouer parce qu'elle était le contact de
-- quelqu'un. C'est un choix DIFFÉRENT de celui d'`antenne_id`, qui est en `restrict` parce
-- que détacher un membre de son antenne en silence perdrait une information de suivi ; ici,
-- perdre le contact d'une fiche supprimée ne perd rien qui subsiste.

alter table public.membres
  add column contact_id uuid references public.membres (id) on delete set null;

alter table public.membres
  add constraint membres_pas_son_propre_contact check (contact_id is distinct from id);

-- Sert la section « ceux dont je suis contact » de /mes-membres (phase 7, lot C), qui filtre
-- sur cette colonne. Les deux autres relations ont le leur depuis 20260812120000.
create index membres_contact_id_idx on public.membres (contact_id);

comment on column public.membres.contact_id is
  'Personne en bonne relation avec ce membre (phase 7, D130). PUREMENT INFORMATIF : n''entre dans aucun calcul d''autorité (peutModifier, prive.peut_lire_membre), n''ouvre aucune lecture (membres_lecture inchangée, D132), et n''est parcouru par aucune fonction récursive de l''arbre (D131) — un contact réciproque entre deux fiches est donc légitime, et aucun déclencheur ne s''y oppose. Écrite par la même voie que les autres colonnes de la fiche, jamais par public.definir_arbre.';
