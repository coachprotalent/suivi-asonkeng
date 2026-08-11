-- Attribution des statuts et journal des mouvements (spec §4.3, décision D7).

create type public.action_statut as enum ('ajout', 'retrait');

create table public.membre_statuts (
  membre_id uuid not null references public.membres (id) on delete cascade,
  statut_id uuid not null references public.statuts (id) on delete restrict,
  date_acquisition date,
  note text,
  attribue_par uuid references public.profils (id) on delete set null,
  attribue_le timestamptz not null default now(),
  primary key (membre_id, statut_id)
);

comment on column public.membre_statuts.date_acquisition is
  'Date à laquelle le membre a acquis ce statut. Facultative : elle n''est pas toujours connue.';

-- membre_id est en tête de la clé primaire composite : déjà indexé.
create index membre_statuts_statut_id_idx on public.membre_statuts (statut_id);
create index membre_statuts_attribue_par_idx on public.membre_statuts (attribue_par);

create table public.journal_statuts (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references public.membres (id) on delete cascade,
  statut_id uuid not null references public.statuts (id) on delete restrict,
  action public.action_statut not null,
  par_profil_id uuid references public.profils (id) on delete set null,
  le timestamptz not null default now(),
  motif text
);

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut. En insertion seule : c''est le seul garde-fou aux modifications directes (spec §5.2).';

create index journal_statuts_membre_id_idx on public.journal_statuts (membre_id, le desc);
create index journal_statuts_statut_id_idx on public.journal_statuts (statut_id);
create index journal_statuts_par_profil_id_idx on public.journal_statuts (par_profil_id);

revoke all on public.membre_statuts from anon, authenticated;
revoke all on public.journal_statuts from anon, authenticated;
grant select on public.membre_statuts to authenticated;
grant select on public.journal_statuts to authenticated;

alter table public.membre_statuts enable row level security;
alter table public.membre_statuts force row level security;
alter table public.journal_statuts enable row level security;
alter table public.journal_statuts force row level security;

-- Lecture alignée sur celle des membres : ce qui est visible d'une fiche l'est de ses statuts.
create policy membre_statuts_lecture on public.membre_statuts
  for select to authenticated
  using (
    (select prive.est_actif())
    and exists (
      select 1 from public.membres m
      where m.id = membre_statuts.membre_id
        and (m.etat = 'actif' or (select prive.est_admin()))
    )
  );

create policy journal_statuts_lecture on public.journal_statuts
  for select to authenticated
  using (
    (select prive.est_actif())
    and exists (
      select 1 from public.membres m
      where m.id = journal_statuts.membre_id
        and (m.etat = 'actif' or (select prive.est_admin()))
    )
  );

-- Garde d'invariant : refuse un second statut d'un groupe exclusif.
-- Les fonctions d'attribution évincent le précédent avant d'insérer, donc ce
-- déclencheur ne se déclenche jamais sur le chemin normal. Il existe pour que
-- l'invariant tienne même si quelqu'un écrit un jour directement dans la table.
create or replace function prive.refuser_statut_exclusif_double()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
begin
  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = new.statut_id;

  if v_exclusif and exists (
    select 1
    from public.membre_statuts ms
    join public.statuts s2 on s2.id = ms.statut_id
    where ms.membre_id = new.membre_id
      and s2.groupe_id = v_groupe
      and ms.statut_id <> new.statut_id
  ) then
    raise exception 'Ce membre porte déjà un statut du groupe exclusif concerné.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger membre_statuts_exclusivite
  before insert on public.membre_statuts
  for each row execute function prive.refuser_statut_exclusif_double();

-- Attribution : évince le statut exclusif concurrent, pose le nouveau, journalise
-- les deux mouvements. Une fonction plutôt que deux appels applicatifs, pour que
-- l'ensemble soit atomique : retirer un statut sans réussir à poser le suivant
-- laisserait la fiche dans un état que personne n'a demandé.
create or replace function prive.attribuer_statut(
  p_membre uuid,
  p_statut uuid,
  p_date date,
  p_note text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groupe uuid;
  v_exclusif boolean;
  v_evince uuid;
begin
  select s.groupe_id, g.exclusif into v_groupe, v_exclusif
  from public.statuts s
  join public.groupes_statut g on g.id = s.groupe_id
  where s.id = p_statut and s.actif;

  if v_groupe is null then
    raise exception 'Statut inconnu ou désactivé.' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from public.membres m where m.id = p_membre) then
    raise exception 'Membre inconnu.' using errcode = 'no_data_found';
  end if;

  if v_exclusif then
    for v_evince in
      select ms.statut_id
      from public.membre_statuts ms
      join public.statuts s2 on s2.id = ms.statut_id
      where ms.membre_id = p_membre and s2.groupe_id = v_groupe and ms.statut_id <> p_statut
    loop
      delete from public.membre_statuts
      where membre_id = p_membre and statut_id = v_evince;

      insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
      values (p_membre, v_evince, 'retrait', p_par, 'Remplacé par un autre statut du même groupe');
    end loop;
  end if;

  insert into public.membre_statuts (membre_id, statut_id, date_acquisition, note, attribue_par)
  values (p_membre, p_statut, p_date, nullif(trim(coalesce(p_note, '')), ''), p_par)
  on conflict (membre_id, statut_id) do update
    set date_acquisition = excluded.date_acquisition,
        note = excluded.note,
        attribue_par = excluded.attribue_par,
        attribue_le = now();

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id)
  values (p_membre, p_statut, 'ajout', p_par);
end;
$$;

create or replace function prive.retirer_statut(
  p_membre uuid,
  p_statut uuid,
  p_par uuid,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supprimees integer;
begin
  delete from public.membre_statuts
  where membre_id = p_membre and statut_id = p_statut;

  get diagnostics v_supprimees = row_count;
  if v_supprimees = 0 then
    -- Un retrait sans effet ne doit pas passer pour un succès.
    raise exception 'Ce membre ne porte pas ce statut.' using errcode = 'no_data_found';
  end if;

  insert into public.journal_statuts (membre_id, statut_id, action, par_profil_id, motif)
  values (p_membre, p_statut, 'retrait', p_par, nullif(trim(coalesce(p_motif, '')), ''));
end;
$$;

-- Ces fonctions écrivent : seule la clé de service peut les appeler, et les Server
-- Actions qui l'emploient traversent toutes `exigerAdministrateur` en amont.
revoke execute on function prive.attribuer_statut(uuid, uuid, date, text, uuid) from public, anon, authenticated;
revoke execute on function prive.retirer_statut(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function prive.attribuer_statut(uuid, uuid, date, text, uuid) to service_role;
grant execute on function prive.retirer_statut(uuid, uuid, uuid, text) to service_role;

-- Passerelles appelables par l'API. Le schéma `prive` n'est pas exposé par PostgREST,
-- et ne doit pas l'être : il contient les fonctions de sécurité du projet. Ces deux
-- passerelles donnent à l'application un point d'entrée dans `public`, sans rien
-- ouvrir d'autre — leur exécution est retirée à tous les rôles sauf `service_role`,
-- que seules les Server Actions emploient, derrière `exigerAdministrateur`.

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
