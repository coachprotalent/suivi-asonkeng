-- Ronde de correction, mineurs D1 et D2 de la revue.
--
-- D1 — 20260818160000_participations.sql (appliquée, non modifiée) affirme, dans un
-- commentaire de tête au-dessus des deux index uniques PARTIELS de D58 : « evenement_id
-- étant en tête des deux, ils servent aussi la lecture paginée des participants d'un
-- événement (D75) sans index supplémentaire. » C'est TROMPEUR : les deux index sont
-- PARTIELS et DISJOINTS (une ligne satisfait exactement un des deux prédicats, D59) — leur
-- combinaison peut au mieux FILTRER sur evenement_id via un balayage bitmap des deux, jamais
-- TRIER. `participantsDEvenementParPage` (Task 15) trie par `saisi_le, id`, un ordre qu'AUCUN
-- des deux index ne porte. Et aucun index SIMPLE (non partiel) de cette table ne porte
-- evenement_id seul : ni participations_membre_id_idx (sur membre_id), ni
-- participations_participant_externe_id_idx (sur participant_externe_id), ni
-- participations_saisi_par_idx (sur saisi_par), ni participations_desir_suivi_idx (partiel,
-- sur participant_externe_id).
--
-- D2 — le commentaire de tête de 20260818120000_types_evenement.sql (appliquée, non
-- modifiée) promettait que rejouer l'amorçage « sur une base où un administrateur aurait
-- déjà créé "Webinaire" à la main » ne lève AUCUNE erreur. Depuis que
-- types_evenement_libelle_normalise_unique existe (20260818190000), c'est FAUX dans le cas
-- général que la phrase elle-même envisage (une variante de CASSE, pas la chaîne identique) :
-- VÉRIFIÉ EMPIRIQUEMENT (table temporaire, transaction annulée, même paire d'index — unique
-- littérale + unique sur lower(trim(...))) —
--   • réinsérer la chaîne EXACTEMENT IDENTIQUE à une ligne déjà présente, via
--     `on conflict (libelle) do nothing`, NE LÈVE RIEN : l'arbitre littéral absorbe le
--     conflit avant que l'index normalisé ne soit même sollicité ;
--   • mais si la base porte déjà une VARIANTE DE CASSE saisie à la main (ex. « webinaire »),
--     réinsérer la chaîne littérale du seed (« Webinaire ») lève réellement
--     `23505 duplicate key value violates unique constraint
--     "types_evenement_libelle_normalise_unique"` — parce que `on conflict (libelle)` ne
--     neutralise que le conflit sur SA propre contrainte (l'arbitre nommé), et Postgres lève
--     quand même l'erreur pour un conflit détecté sur un AUTRE index unique non nommé.
-- Un `supabase db reset` complet reste sain : l'ordre des migrations crée l'index normalisé
-- APRÈS l'insertion initiale, sur des lignes déjà uniques deux fois. C'est UNIQUEMENT le
-- scénario que 20260818120000 citait lui-même comme sûr — une variante de casse déjà
-- présente — qui est concerné, et qui ne l'est plus.
--
-- Les deux commentaires de tête restent inchangés dans leurs fichiers (appliqués, non
-- modifiés, et l'édition ne changerait rien à ce qui est posé en base) ; cette migration pose
-- la légende exacte sur les objets, additivement.

comment on index public.participations_membre_unique is
  'Moitié PARTIELLE de D58, (evenement_id, membre_id) where membre_id is not null. Ronde de correction, mineur D1 : NE fournit PAS, seule ni combinée à sa jumelle participations_externe_unique, un chemin de LECTURE TRIÉE pour participantsDEvenementParPage (Task 15) — cet index est ordonné par membre_id, pas par saisi_le puis id, et la lecture paginée de la Task 15 ne filtre que sur evenement_id, sans jamais toucher membre_id ni participant_externe_id dans son WHERE. Le commentaire de tête de 20260818160000 (appliqué, non modifié) affirmait que ces deux index servaient « la lecture paginée des participants d''un événement... sans index supplémentaire » : trompeur — au mieux un FILTRE bitmap combiné des deux, jamais un TRI. Aucun index SIMPLE (non partiel) de cette table ne porte evenement_id seul.';

comment on index public.participations_externe_unique is
  'Moitié PARTIELLE de D58, (evenement_id, participant_externe_id) where participant_externe_id is not null — DISJOINTE de participations_membre_unique (une ligne ne peut satisfaire les deux prédicats à la fois, D59). Ronde de correction, mineur D1 : voir le commentaire de participations_membre_unique — même correction, même portée, ni l''un ni l''autre ne sert le tri saisi_le puis id de participantsDEvenementParPage (Task 15).';

comment on constraint types_evenement_libelle_unique on public.types_evenement is
  'Clé naturelle LITTÉRALE, et ancre du `on conflict (libelle) do nothing` de l''amorçage (D57) : rejouer l''amorçage avec les QUATRE CHAÎNES LITTÉRALES EXACTES du seed ne crée jamais de doublon — l''arbitre littéral absorbe ce conflit avant même que l''index normalisé ci-dessous ne soit sollicité (vérifié empiriquement). Cette contrainte ne protège PAS contre une variante de casse ou d''espacement saisie par un administrateur ("Webinaire" et "webinaire" sont deux lignes distinctes pour elle) — c''est types_evenement_libelle_normalise_unique (ronde de correction, revue Tasks 4-6) qui ferme ce doublon-là, sur lower(trim(libelle)). MINEUR NON DIT PAR 20260818190000 (ronde de correction, mineur D2), VÉRIFIÉ EMPIRIQUEMENT : depuis que cet index normalisé existe, REJOUER L''AMORÇAGE SUR UNE BASE QUI PORTE DÉJÀ UNE VARIANTE DE CASSE saisie à la main — exactement le scénario que le commentaire de tête de 20260818120000 citait comme sûr — LÈVE RÉELLEMENT UN 23505 sur types_evenement_libelle_normalise_unique : `on conflict (libelle)` ne neutralise que le conflit sur SA propre contrainte, pas celui détecté sur un autre index unique non nommé comme arbitre. Un `supabase db reset` complet reste sain (l''index normalisé est créé après l''insertion initiale, sur des lignes déjà uniques deux fois) ; seul ce scénario précis de rejeu sur variante préexistante est concerné.';
