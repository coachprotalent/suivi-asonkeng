-- D66 — nouvelle origine de demande : la conversion d'un participant externe par le
-- chemin 1 (fiche en_attente rejoignant le circuit de validation de /demandes, où elle est
-- passée à `actif` par le bouton « Valider comme nouvelle personne » — le SEUL geste de
-- l'application qui active une fiche en_attente).
--
-- ⚠️ CE FICHIER NE CONTIENT QUE CETTE INSTRUCTION, ET C'EST OBLIGATOIRE.
-- `alter type ... add value` ajoute une valeur qui NE PEUT PAS ÊTRE EMPLOYÉE dans la même
-- transaction que son ajout, et supabase db push joue chaque fichier dans sa propre
-- transaction. Toute instruction ajoutée ici qui EMPLOIE la valeur — un insert, une
-- fonction dont le corps la compare littéralement, une contrainte check — ferait échouer
-- la migration entière avec « unsafe use of new value ».
--
-- Pourquoi pas réutiliser `demande_suivi` : D32 pose que l'origine d'une demande est
-- EXPLICITE, jamais inférée. La réutiliser mentirait sur la provenance et brancherait
-- l'écran de validation sur le mauvais comportement — poser le DEMANDEUR comme faiseur de
-- disciple, alors que l'administrateur qui convertit n'est pas le faiseur de disciple de
-- la personne convertie.

alter type public.origine_demande add value 'conversion_participant';
