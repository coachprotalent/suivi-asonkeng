import 'server-only'
import type { EtatMembre, SituationMembre } from '@/lib/domaine/membre'
import { clientServeur } from '@/lib/supabase/serveur'

export type MembreListe = {
  id: string
  nom: string
  prenom: string
  ville: string | null
  antenneNom: string | null
  situation: SituationMembre | null
}

export type MembreDetail = MembreListe & {
  telephone: string | null
  emailContact: string | null
  pays: string | null
  antenneId: string | null
  domaineEtude: string | null
  reportInitialAel: number
  etat: EtatMembre
}

const COLONNES_LISTE = 'id, nom, prenom, ville, situation, antennes(nom)'
const COLONNES_DETAIL =
  'id, nom, prenom, ville, situation, telephone, email_contact, pays, antenne_id, domaine_etude, report_initial_ael, etat, antennes(nom)'

type LigneAntenne = { nom: string } | { nom: string }[] | null

function nomAntenne(valeur: LigneAntenne): string | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0]?.nom ?? null) : valeur.nom
}

/**
 * Membres visibles par le compte appelant, triés par nom puis prénom.
 * La RLS décide de ce qui est visible ; ce module ne refait pas ce filtrage.
 */
export async function listerMembres(filtres?: {
  recherche?: string
  antenneId?: string
}): Promise<MembreListe[]> {
  const supabase = await clientServeur()
  // `etat = 'actif'` explicitement, et pas seulement via la RLS : la politique laisse
  // un administrateur voir aussi les fiches archivées, or l'annuaire est la liste des
  // membres en cours de suivi. Sans ce filtre, archiver une fiche ne la ferait pas
  // disparaître pour un administrateur — exactement l'inverse de ce qu'il attend.
  let requete = supabase
    .from('membres')
    .select(COLONNES_LISTE)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')

  const recherche = filtres?.recherche?.trim()
  if (recherche) {
    // PostgREST réserve `, . : * ( )` dans la valeur d'un filtre. Plutôt que de
    // retenir une liste de caractères à retirer — qui sera incomplète le jour où
    // elle changera — on entoure la valeur de guillemets, forme dans laquelle
    // PostgREST accepte tout, en n'échappant que ce que les guillemets exigent.
    // Sans cela, chercher « St. Etienne » casse la requête, et comme l'erreur
    // était ignorée, l'écran annonçait « aucun membre » pour une recherche valide.
    const terme = recherche
      .replace(/[\\"]/g, '\\$&') // échapper l'antislash et le guillemet
      .replace(/[%_]/g, '') // neutraliser les jokers de `ilike`
    if (terme.length > 0) {
      const motif = `"%${terme}%"`
      requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
    }
  }
  if (filtres?.antenneId) {
    requete = requete.eq('antenne_id', filtres.antenneId)
  }

  const { data, error } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'un résultat vide : annoncer
    // « aucun membre » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des membres impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
    ville: l.ville as string | null,
    situation: l.situation as SituationMembre | null,
    antenneNom: nomAntenne(l.antennes as LigneAntenne),
  }))
}

/**
 * Fiche complète, ou `null` si elle n'existe pas ou n'est pas visible par l'appelant.
 *
 * Contrairement à `listerMembres`, cette fonction ne filtre **pas** sur l'état : un
 * administrateur doit pouvoir ouvrir une fiche archivée depuis un lien direct. Ce
 * n'est pas un oubli, et la sécurité au niveau des lignes reste seule juge de ce qui
 * est visible.
 */
export async function membreParId(id: string): Promise<MembreDetail | null> {
  const supabase = await clientServeur()
  const { data } = await supabase.from('membres').select(COLONNES_DETAIL).eq('id', id).maybeSingle()
  if (!data) return null

  return {
    id: data.id as string,
    nom: data.nom as string,
    prenom: data.prenom as string,
    ville: data.ville as string | null,
    situation: data.situation as SituationMembre | null,
    antenneNom: nomAntenne(data.antennes as LigneAntenne),
    telephone: data.telephone as string | null,
    emailContact: data.email_contact as string | null,
    pays: data.pays as string | null,
    antenneId: data.antenne_id as string | null,
    domaineEtude: data.domaine_etude as string | null,
    reportInitialAel: data.report_initial_ael as number,
    etat: data.etat as EtatMembre,
  }
}
