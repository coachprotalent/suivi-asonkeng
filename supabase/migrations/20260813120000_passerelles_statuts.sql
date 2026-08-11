-- Passerelles appelables par l'API. Le schéma `prive` n'est pas exposé par PostgREST,
-- et ne doit pas l'être : il contient les fonctions de sécurité du projet. Ces deux
-- passerelles donnent à l'application un point d'entrée dans `public`, sans rien
-- ouvrir d'autre — leur exécution est retirée à tous les rôles sauf `service_role`,
-- que seules les Server Actions emploient, derrière `exigerAdministrateur`.
--
-- Migration séparée et non ajout à la précédente : `supabase db push` suit les
-- migrations par version et non par contenu. Compléter un fichier déjà appliqué ne
-- rejoue rien et laisse le dépôt en désaccord silencieux avec la base.

create or replace function public.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  select prive.attribuer_statut(p_membre, p_statut, p_date, p_note, p_par);
$$;

create or replace function public.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select prive.retirer_statut(p_membre, p_statut, p_par, p_motif);
$$;

revoke execute on function public.attribuer_statut(uuid, uuid, date, text, uuid) from public, anon, authenticated;
revoke execute on function public.retirer_statut(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attribuer_statut(uuid, uuid, date, text, uuid) to service_role;
grant execute on function public.retirer_statut(uuid, uuid, uuid, text) to service_role;
