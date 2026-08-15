-- Phase 5, D99 — CORRECTIF sur du code DÉPLOYÉ, strictement additif : seuls les CORPS de
-- trois fonctions de déclencheur sont réécrits. AUCUN déclencheur n'est créé, supprimé ni
-- redéfini ; les trois `create trigger` de 20260814120000, 20260814140000 et
-- 20260814150000 restent en place et continuent de pointer sur ces mêmes fonctions.
--
-- L'INVARIANT QUE CES TROIS GARDES TIENNENT, ÉLARGI :
--   AUCUN MEMBRE `actif` N'A D'ANCÊTRE QUI NE SOIT PAS `actif`.
--
-- Il était énoncé « pas d'ancêtre `archive` », et les trois corps comparaient
-- littéralement à 'archive'. Or public.etat_membre a TROIS valeurs (20260812120000), et
-- l'arborescence de la phase 5 exclut `en_attente` EXACTEMENT comme `archive`
-- (`.eq('etat','actif')` sur les deux lectures paginées). Un maillon `en_attente`
-- produisait donc le même trou qu'un maillon `archive`, avec une conséquence que le cas
-- `archive` n'avait pas : toute la descendance ACTIVE d'un faiseur `en_attente` devenait
-- INATTEIGNABLE depuis la liste des racines — ces fiches ont un faiseur, donc ne sont pas
-- racines, et leur parent n'est jamais rendu. Rien ne le signalait.
--
-- MARQUEURS. `disciples_a_reaffecter` et `faiseur_de_disciple_archive` gardent leur texte
-- ET leur sens : les branches applicatives qui les discriminent aujourd'hui continuent de
-- recevoir exactement ce qu'elles recevaient. Le seul cas nouveau — faiseur ni actif ni
-- archivé — reçoit le marqueur NOUVEAU `faiseur_de_disciple_inactif`, parce que le message
-- commandé par `faiseur_de_disciple_archive` dit « est archivé » et mentirait ici. L'ordre
-- des branches est donc `archive` D'ABORD, `is distinct from 'actif'` ensuite.
--
-- VERROU DE LIGNE dans les deux gardes qui lisent l'état du FAISEUR. Ces déclencheurs sont
-- la barrière de TOUTE écriture, y compris les `insert` directs qui ne passent pas par
-- public.definir_arbre — celui de convertir_participant_externe (chemin 2, 20260818220000)
-- pose un faiseur sans jamais lire son état. Sans `for share`, un archivage concurrent du
-- faiseur restait invisible à la lecture du déclencheur : les deux transactions
-- validaient. Ce n'est PAS une redondance avec le `for share` de public.definir_arbre :
-- celui-là sert à rendre un message JUSTE avant d'écrire, celui-ci protège les écritures
-- qui ne passent pas par la passerelle.

-- (1) Quitter l'état `actif` alors qu'on a encore des disciples actifs.
--     ANCIENNE CONDITION : `if new.etat <> 'archive' or old.etat = 'archive'` — elle ne
--     surveillait QUE la transition vers `archive`, et laissait passer `actif` ->
--     `en_attente` avec des disciples actifs.
--     NOUVELLE CONDITION : on sort si la fiche RESTE active (rien à vérifier), ou si son
--     état ne change pas (une mise à jour sans effet ne doit pas refuser ce qui existe
--     déjà). Toute AUTRE transition — donc toute sortie de `actif`, et le passage
--     `en_attente` -> `archive` que l'ancienne condition couvrait déjà — recompte.
create or replace function prive.refuser_archivage_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disciples integer;
begin
  if new.etat = 'actif' or old.etat = new.etat then
    return new;
  end if;

  select count(*) into v_disciples
  from public.membres m
  where m.faiseur_de_disciple_id = new.id
    and m.etat = 'actif';

  if v_disciples > 0 then
    raise exception 'Ce membre est encore faiseur de disciple de % personne(s) active(s).', v_disciples
      using detail = 'disciples_a_reaffecter';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_archivage_faiseur_de_disciple() is
  'Déclencheur before update of etat sur public.membres : refuse à un membre de QUITTER l''état actif tant qu''il est encore faiseur de disciple d''au moins un membre actif (spec §7). ÉLARGI PAR LA PHASE 5 (D99) : la condition ne surveillait que la transition vers ''archive'' et laissait donc passer actif -> en_attente avec des disciples actifs, ce qui rendait toute la descendance active inatteignable depuis les racines de l''arborescence. Une mise à jour qui ne change pas l''état ne déclenche rien. Barrière de dernier recours : le contrôle en amont, dans archiverMembre, nomme les personnes concernées avant d''écrire ; ce déclencheur protège même une écriture directe ou concurrente. Marqueur inchangé : disciples_a_reaffecter.';

-- (2) Redevenir `actif` alors que son faiseur ne l'est pas.
create or replace function prive.refuser_desarchivage_faiseur_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.etat <> 'actif' or old.etat = 'actif' then
    return new;
  end if;

  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select m.etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id
  for share;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple de ce membre est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;
  if v_etat_faiseur is distinct from 'actif' then
    raise exception 'Le faiseur de disciple de ce membre n''est pas un membre actif.'
      using detail = 'faiseur_de_disciple_inactif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_desarchivage_faiseur_archive() is
  'Déclencheur before update of etat sur public.membres : refuse de rendre un membre actif quand son faiseur de disciple ne l''est pas. Ferme le contournement de 20260814120000 : archiver le disciple puis son faiseur passe, mais rétablir ensuite le disciple recréerait l''état que l''archivage interdit. ÉLARGI PAR LA PHASE 5 (D99) : la comparaison ne portait que sur ''archive'' ; un faiseur ''en_attente'' passait, et l''arborescence l''exclut comme un archivé. VERROUILLÉ PAR LA PHASE 5 (D83) : l''état du faiseur est lu `for share`, sans quoi un archivage concurrent du faiseur restait invisible et les deux transactions validaient. Faiseur archivé : marqueur faiseur_de_disciple_archive, inchangé. Faiseur ni actif ni archivé : marqueur NOUVEAU faiseur_de_disciple_inactif. Barrière de dernier recours : le contrôle en amont, dans desarchiverMembre, nomme le faiseur concerné avant d''écrire.';

-- (3) Se rattacher à un faiseur qui n'est pas actif, à l'`insert` COMME à l'`update`.
create or replace function prive.refuser_faiseur_de_disciple_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select m.etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id
  for share;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple choisi est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;
  if v_etat_faiseur is distinct from 'actif' then
    raise exception 'Le faiseur de disciple choisi n''est pas un membre actif.'
      using detail = 'faiseur_de_disciple_inactif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_faiseur_de_disciple_archive() is
  'Déclencheur before insert or update of faiseur_de_disciple_id sur public.membres : refuse de rattacher un membre à un faiseur de disciple qui n''est pas ACTIF. Barrière de dernier recours, sur le même modèle que membres_anti_cycle : public.definir_arbre porte la même vérification pour produire un message avant d''écrire ; ce déclencheur protège aussi les écritures directes — l''insert de convertir_participant_externe (chemin 2) pose un faiseur sans jamais lire son état. ÉLARGI PAR LA PHASE 5 (D99) : la comparaison ne portait que sur ''archive'', et rien n''interdisait de rattacher un membre actif à un faiseur ''en_attente'', que l''arborescence exclut comme un archivé. VERROUILLÉ PAR LA PHASE 5 (D83) : l''état du faiseur est lu `for share`, sans quoi un archivage concurrent du faiseur restait invisible à ce déclencheur. Faiseur archivé : marqueur faiseur_de_disciple_archive, inchangé — même fait constaté que dans prive.refuser_desarchivage_faiseur_archive. Faiseur ni actif ni archivé : marqueur NOUVEAU faiseur_de_disciple_inactif, distinct parce que le message commandé par le premier dit « est archivé » et mentirait ici.';
