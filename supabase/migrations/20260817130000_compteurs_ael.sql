-- Compteur AEL par membre : report initial + présences aux séances TENUES (spec §4.2,
-- §4.5, D4, D48). Vue calculée : rien à synchroniser, le total ne peut pas diverger de
-- son historique — même raisonnement que le report initial lui-même.

create view public.compteurs_ael
  with (security_invoker = true) as
select
  m.id as membre_id,
  m.report_initial_ael
    + coalesce(count(p.membre_id) filter (
        where p.present and s.etat = 'tenue'
      ), 0) as total
from public.membres m
left join public.presences_ael p on p.membre_id = m.id
left join public.seances_ael s on s.id = p.seance_id
group by m.id, m.report_initial_ael;

comment on view public.compteurs_ael is
  'Compteur AEL calculé : report initial + présences (present = true) aux séances à l''état tenue, rien d''autre (D4, D48). `security_invoker = true` : hérite de la RLS de membres, presences_ael et seances_ael, sans politique propre — une fiche archivée reste invisible à qui ne devrait pas la voir (§5.3). Ne varie jamais rétroactivement avec l''archivage ou un changement d''antenne du membre : aucune des tables jointes ne dépend de son état ou de son antenne courante.';

revoke all on public.compteurs_ael from anon, authenticated;
grant select on public.compteurs_ael to authenticated;
