'use server'

import { revalidatePath } from 'next/cache'
import { genererCodeInscription, hacherCodeInscription } from '@/lib/domaine/token-inscription'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_GENERATION,
  MESSAGE_ECHEC_REVOCATION,
  MESSAGE_MEMBRE_OBLIGATOIRE,
  MESSAGE_MODE_INVALIDE,
  MESSAGE_TOKEN_DEJA_CLOS,
  MESSAGE_VALIDITE_INVALIDE,
} from './messages'

export type EtatToken = { erreur: string | null; codeGenere: string | null }

export async function genererToken(_etat: EtatToken, donnees: FormData): Promise<EtatToken> {
  const profil = await exigerAdministrateur()

  const mode = String(donnees.get('mode') ?? '')
  if (mode !== 'nominatif' && mode !== 'generique') {
    return { erreur: MESSAGE_MODE_INVALIDE, codeGenere: null }
  }

  const membreId = mode === 'nominatif' ? String(donnees.get('membreId') ?? '') : ''
  if (mode === 'nominatif' && membreId.length === 0) {
    return { erreur: MESSAGE_MEMBRE_OBLIGATOIRE, codeGenere: null }
  }

  const jours = Number(donnees.get('validiteJours'))
  if (!Number.isFinite(jours) || jours <= 0) {
    return { erreur: MESSAGE_VALIDITE_INVALIDE, codeGenere: null }
  }

  const code = genererCodeInscription()
  const codeHash = hacherCodeInscription(code)
  const expireLe = new Date(Date.now() + jours * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await clientAdmin().from('tokens_inscription').insert({
    code_hash: codeHash,
    mode,
    membre_id: mode === 'nominatif' ? membreId : null,
    cree_par: profil.id,
    expire_le: expireLe,
  })

  if (error) {
    // Le code en clair n'apparaît nulle part dans cette trace, et ne doit jamais y
    // apparaître : seul son hachage (déjà en base, ou perdu si l'insertion a
    // échoué) permet de le vérifier hors ligne.
    console.error('genererToken : échec', { mode, membreId, code: error.code, message: error.message })
    return { erreur: MESSAGE_ECHEC_GENERATION, codeGenere: null }
  }

  revalidatePath('/tokens')
  // PAS de redirect : le code en clair ne s'affiche qu'ici, une seule fois — même
  // mécanique que creerCompte pour le mot de passe temporaire (1c).
  return { erreur: null, codeGenere: code }
}

export type ResultatRevocation = { erreur: string | null }

/**
 * RETOURNE son refus, elle ne le lève plus (correction post-Task-17,
 * revue de production : un `throw` levé depuis une Server Action perd son
 * message avant même d'atteindre le `catch` du composant client — React le
 * remplace par un digest interne en production (« Minified React error #441…
 * », react.dev/errors/441 : « The specific message is omitted in production
 * builds »). Observé pour de vrai contre un build de production ; voir le
 * commentaire de tête de `src/app/demandes/actions.ts` et
 * `tests/e2e-prod/`.
 */
export async function revoquerToken(donnees: FormData): Promise<ResultatRevocation> {
  await exigerAdministrateur()

  const tokenId = String(donnees.get('tokenId') ?? '')
  if (tokenId.length === 0) {
    console.error('revoquerToken : identifiant de token manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_REVOCATION }
  }

  const { data, error } = await clientAdmin()
    .from('tokens_inscription')
    .update({ revoque_le: new Date().toISOString() })
    .eq('id', tokenId)
    .is('revoque_le', null)
    .is('utilise_le', null)
    .select('id')

  if (error) {
    console.error('revoquerToken : échec', { tokenId, code: error.code, message: error.message })
    return { erreur: MESSAGE_ECHEC_REVOCATION }
  }
  if (!data || data.length === 0) {
    // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur : token
    // déjà révoqué, déjà utilisé, ou inconnu — dans les trois cas, plus rien à
    // révoquer.
    return { erreur: MESSAGE_TOKEN_DEJA_CLOS }
  }

  revalidatePath('/tokens')
  return { erreur: null }
}
