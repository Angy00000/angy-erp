// Coordonnées de l'équipe Angy Company affichées aux clients (compte bloqué, aide).
// Renseigner le numéro WhatsApp (9 chiffres, ex. '77xxxxxxx') pour activer le bouton de contact.
export const SUPPORT = {
  name: 'Angy Company',
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '',
};
