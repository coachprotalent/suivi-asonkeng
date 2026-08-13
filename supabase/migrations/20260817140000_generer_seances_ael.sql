-- Génération idempotente des séances AEL depuis un horizon d'occurrences déjà calculé
-- côté application (spec D28, design phase 3 D38, D41). Motif des passerelles de
-- statuts et d'arbre (1b, 1c) : point d'entrée `public`, exécution réservée à
-- `service_role`, que seule la Server Action `genererSeances` (Task 14) emploie,
-- derrière `exigerModerateurOuAdministrateur`.
--
-- `p_occurrences` est un tableau JSON, un élément par occurrence :
--   { "calendrier_id": uuid, "antenne_id": uuid, "date": "AAAA-MM-JJ", "heure": "HH:MM" | "" }
-- Chaque élément suppose (D41 : une séance par ligne de calendrier, jamais fusionnée) un
-- couple (calendrier_id, date) UNIQUE dans le tableau — c'est ce que
-- `calculerOccurrences` (Task 11) garantit par construction pour un calendrier donné, et
-- que `genererSeances` (Task 14) préserve en concaténant les listes de calendriers
-- distincts, jamais en les fusionnant.
create or replace function public.generer_seances_ael(p_occurrences jsonb)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with entree as (
    select
      (elem ->> 'calendrier_id')::uuid as calendrier_id,
      (elem ->> 'antenne_id')::uuid as antenne_id,
      (elem ->> 'date')::date as date,
      nullif(elem ->> 'heure', '')::time as heure
    from jsonb_array_elements(p_occurrences) as elem
  ),
  inserees as (
    insert into public.seances_ael as sa (calendrier_id, genere_pour_le, date, heure, etat)
    select calendrier_id, date, date, heure, 'prevue'
    from entree
    -- Le cœur de l'idempotence (D38) : une occurrence déjà générée pour ce calendrier
    -- ne produit RIEN, jamais une erreur ni un doublon. Cette clause est
    -- syntaxiquement dépendante de `seances_ael_generation_unique` (Task 7) — voir la
    -- preuve par mutation de l'étape 6 de cette tâche.
    on conflict (calendrier_id, genere_pour_le) do nothing
    -- Qualifié par l'alias `sa`, pas juste `id` : `returns table (id uuid)` fait de `id`
    -- un paramètre OUT visible dans TOUT le corps de la fonction (règle PL/pgSQL), y
    -- compris à l'intérieur d'un CTE d'un `return query`. Sans qualification, Postgres
    -- refuse la clause avec `42702` (« column reference "id" is ambiguous ») — constaté
    -- en pratique, pas supposé : voir le rapport de tâche.
    returning sa.id, sa.calendrier_id, sa.genere_pour_le
  ),
  -- N'insère la ligne d'antenne QUE pour les séances EFFECTIVEMENT créées à l'instant
  -- (celles qui existaient déjà n'apparaissent pas dans `inserees`) : la ligne de
  -- jonction ne peut donc jamais exister sans sa séance, ni être dupliquée par un
  -- second appel.
  jonction as (
    insert into public.seances_ael_antennes (seance_id, antenne_id)
    select i.id, e.antenne_id
    from inserees i
    join entree e on e.calendrier_id = i.calendrier_id and e.date = i.genere_pour_le
    -- `genererSeances` (Task 14) ne peut pas produire deux fois le même couple
    -- (calendrier_id, date) — voir le commentaire d'en-tête. Mais cette fonction est
    -- appelable directement par `service_role` : sans cette clause, un tel appel ferait
    -- lever la clé primaire de `seances_ael_antennes` en `23505` non absorbé, et TOUTE
    -- la génération échouerait sur un message générique. Un mot, et l'hypothèse cesse
    -- d'être une condition de fonctionnement.
    on conflict (seance_id, antenne_id) do nothing
    returning seance_id
  )
  select i.id from inserees i;
end;
$$;

comment on function public.generer_seances_ael(jsonb) is
  'Génère les séances AEL pour les occurrences fournies, de façon idempotente (D28, D38) : un second appel avec le même horizon ne crée rien pour les occurrences déjà présentes. Insère la séance et sa ligne d''antenne dans la même transaction (D41). Réservée à service_role.';

revoke execute on function public.generer_seances_ael(jsonb) from public, anon, authenticated;
grant execute on function public.generer_seances_ael(jsonb) to service_role;
