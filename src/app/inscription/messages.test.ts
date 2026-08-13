import { describe, expect, it } from 'vitest'
import {
  MESSAGE_CODE_INVALIDE,
  MESSAGE_TROP_DE_TENTATIVES,
  messageErreurConsommation,
} from './messages'

describe('messageErreurConsommation', () => {
  it('mappe trop_de_tentatives sur son message dédié', () => {
    expect(messageErreurConsommation('trop_de_tentatives')).toBe(MESSAGE_TROP_DE_TENTATIVES)
  })

  // Les QUATRE causes distinctes côté base (code inconnu, expiré, révoqué, déjà
  // utilisé) produisent toutes le MÊME statut invalide (design 2b §7.1) : ce
  // test ne peut donc pas les distinguer ici, PAR CONSTRUCTION — c'est
  // précisément ce que D30 exige. La preuve que les quatre causes convergent
  // réellement vers ce statut unique se fait à la couche SQL
  // (tests/rls/tokens-inscription.test.ts, bloc « RÉCAPITULATIF »).
  it('mappe invalide, et tout statut inconnu, sur le MÊME message uniforme', () => {
    expect(messageErreurConsommation('invalide')).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation('un_statut_qui_nexiste_pas')).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation(null)).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation(undefined)).toBe(MESSAGE_CODE_INVALIDE)
  })

  // CONTRÔLE POSITIF : sans lui, une implémentation qui rendrait TOUJOURS le même
  // message (y compris pour trop_de_tentatives) passerait aussi le premier test.
  it("les deux messages sont bien distincts l'un de l'autre", () => {
    expect(MESSAGE_TROP_DE_TENTATIVES).not.toBe(MESSAGE_CODE_INVALIDE)
  })
})
