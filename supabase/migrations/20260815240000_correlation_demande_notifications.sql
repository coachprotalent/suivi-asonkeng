-- Colonne de corrélation explicite entre une notification et la demande qui l'a
-- déclenchée (arbitrage de la ronde de correction sur I4b, phase 2b).
--
-- Diagnostic : `notifications.lien` faisait double emploi — à la fois cible de
-- navigation ET clé de corrélation servant à retrouver « les notifications de
-- cette demande » (matching utilisé par annuler_demande_membre,
-- migration 20260815200000/220000, et par la marque-lues ajoutée à
-- valider_demande_rattachement, migration 20260815230000). Tant que le lien
-- encodait l'id de la demande (`/demandes/${id}`), cette confusion restait
-- invisible. Une fois le lien rendu honnête (`/demandes`, la liste — il n'existe
-- pas de route `/demandes/[id]` planifiée dans cette phase), il a cessé de
-- pouvoir servir de clé : toutes les notifications nouvelle_demande partagent
-- désormais le même lien, et un filtre dessus devient un filtre qui ne filtre
-- plus rien (sélectivité perdue — régression constatée et signalée).
--
-- Correction : séparer les deux rôles. `lien` reste réservé à la navigation.
-- `demande_id`, NOUVELLE colonne, NULLABLE (toute notification ne concerne pas
-- une demande), `on delete cascade` (une notification qui survivrait à la
-- disparition de son objet n'aurait plus de sens), porte désormais la
-- corrélation.

alter table public.notifications
  add column demande_id uuid references public.demandes_membre (id) on delete cascade;

comment on column public.notifications.demande_id is
  'Corrélation explicite avec la demande qui a déclenché cette notification (ronde de correction I4b) — NULLABLE (toute notification ne concerne pas une demande), on delete cascade. Remplace le lien comme clé de filtrage : lien reste réservé à la navigation, jamais réutilisé pour retrouver "les notifications de cette demande".';

create index notifications_demande_id_idx on public.notifications (demande_id);
