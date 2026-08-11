import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type StatutCatalogue = { id: string; libelle: string; actif: boolean }
export type GroupeStatut = {
  id: string
  nom: string
  exclusif: boolean
  statuts: StatutCatalogue[]
}
export type StatutDuMembre = {
  statutId: string
  libelle: string
  groupeNom: string
  dateAcquisition: string | null
  note: string | null
}
export type EntreeJournal = {
  id: string
  libelle: string
  action: 'ajout' | 'retrait'
  le: string
  parNomAffichage: string | null
  motif: string | null
}

/**
 * PostgREST renvoie un OBJET pour une ressource imbriquée en plusieurs-vers-un,
 * mais le client, faute de types `Database` générés, la déclare comme un tableau.
 * Les deux formes se ramènent ici à une seule. Même contournement que `nomAntenne`
 * dans `membres.ts`, généralisé pour trois relations distinctes de ce module
 * (statut et groupe dans `statutsDuMembre`, statut et profil dans
 * `journalDuMembre`), soit quatre appels.
 */
type Imbrique<T> = T | T[] | null | undefined

function premier<T>(valeur: Imbrique<T>): T | null {
  if (valeur === null || valeur === undefined) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

type StatutImbrique = {
  libelle: string
  groupes_statut: Imbrique<{ nom: string; ordre: number }>
}

/**
 * Catalogue groupé, trié. `inclureInactifs` sert l'écran d'administration : sans
 * lui, un statut désactivé disparaîtrait de l'interface sans retour possible —
 * l'impasse déjà rencontrée avec les antennes en phase 1a.
 */
export async function listerCatalogue(inclureInactifs = false): Promise<GroupeStatut[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('groupes_statut')
    .select('id, nom, exclusif, ordre, statuts(id, libelle, actif, ordre)')
    .order('ordre')

  if (error) {
    throw new Error(`Lecture du catalogue impossible : ${error.message}`)
  }

  return (data ?? []).map((g) => ({
    id: g.id as string,
    nom: g.nom as string,
    exclusif: g.exclusif as boolean,
    statuts: ((g.statuts ?? []) as Array<Record<string, unknown>>)
      .filter((s) => inclureInactifs || s.actif === true)
      .sort((a, b) => Number(a.ordre) - Number(b.ordre))
      .map((s) => ({ id: s.id as string, libelle: s.libelle as string, actif: s.actif as boolean })),
  }))
}

/** Statuts portés par un membre, triés par groupe puis par libellé. */
export async function statutsDuMembre(membreId: string): Promise<StatutDuMembre[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membre_statuts')
    .select('statut_id, date_acquisition, note, statuts(libelle, groupes_statut(nom, ordre))')
    .eq('membre_id', membreId)

  if (error) {
    throw new Error(`Lecture des statuts impossible : ${error.message}`)
  }

  // L'ordre du groupe sert au tri mais ne sort pas d'ici : on le porte à côté de la
  // ligne plutôt que dedans, pour n'avoir ensuite rien à en retirer.
  return (data ?? [])
    .map((l) => {
      const statutId = l.statut_id as string
      const statut = premier(l.statuts as Imbrique<StatutImbrique>)
      // `statuts.id` est référencé par `membre_statuts.statut_id` en `on delete
      // restrict`, et la politique de lecture de `statuts` n'exige que `est_actif()`
      // — comme celle de `membre_statuts`. Si la ligne a pu être lue, le statut est
      // forcément lisible aussi : un `statut` absent ici n'est pas une donnée
      // manquante, c'est une jointure cassée. La déguiser en « — » masquerait le
      // défaut au lieu de le signaler.
      if (!statut) {
        throw new Error(
          `Jointure incomplète : le statut ${statutId} référencé par membre_statuts est introuvable.`,
        )
      }
      const groupe = premier(statut.groupes_statut)
      // Même raisonnement : `statuts.groupe_id` est `not null` et référence
      // `groupes_statut` en `on delete restrict`, sous la même politique de lecture.
      if (!groupe) {
        throw new Error(
          `Jointure incomplète : le groupe du statut ${statutId} est introuvable.`,
        )
      }
      return {
        ordreGroupe: groupe.ordre,
        ligne: {
          statutId,
          libelle: statut.libelle,
          groupeNom: groupe.nom,
          dateAcquisition: l.date_acquisition as string | null,
          note: l.note as string | null,
        },
      }
    })
    .sort(
      (a, b) =>
        a.ordreGroupe - b.ordreGroupe || a.ligne.libelle.localeCompare(b.ligne.libelle, 'fr'),
    )
    .map(({ ligne }) => ligne)
}

/** Journal d'un membre, du plus récent au plus ancien. */
export async function journalDuMembre(membreId: string): Promise<EntreeJournal[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('journal_statuts')
    .select('id, action, le, motif, statuts(libelle), profils(nom_affichage)')
    .eq('membre_id', membreId)
    .order('le', { ascending: false })

  if (error) {
    throw new Error(`Lecture du journal impossible : ${error.message}`)
  }

  return (data ?? []).map((l) => {
    const id = l.id as string
    const statut = premier(l.statuts as Imbrique<{ libelle: string }>)
    // `journal_statuts.statut_id` référence `statuts` en `on delete restrict`, sous
    // la même politique de lecture que `journal_statuts` : un statut absent ici est
    // une jointure cassée, pas une entrée sans statut légitime.
    if (!statut) {
      throw new Error(`Jointure incomplète : le statut de l'entrée de journal ${id} est introuvable.`)
    }
    // `par_profil_id`, lui, est en `on delete set null` : un auteur supprimé est un
    // cas réel et attendu. Le repli à `null` reste donc correct ici, sans lever.
    const profil = premier(l.profils as Imbrique<{ nom_affichage: string }>)
    return {
      id,
      libelle: statut.libelle,
      action: l.action as 'ajout' | 'retrait',
      le: l.le as string,
      parNomAffichage: profil?.nom_affichage ?? null,
      motif: l.motif as string | null,
    }
  })
}
