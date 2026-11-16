import { one, q } from './db';

// Réglages de la plateforme, modifiables depuis la console Angy Company (onglet Réglages).
export const SETTINGS_DEFAULT = { whatsapp: '', telephone: '', email: '', adresse: 'Dakar, Sénégal', essai_jours: 30 };

export async function getSettings() {
  const r = await one("SELECT value FROM platform_settings WHERE key='site'").catch(() => null);
  return { ...SETTINGS_DEFAULT, ...(r?.value || {}) };
}

export async function saveSettings(b) {
  const t = (v, n = 160) => String(v ?? '').trim().slice(0, n);
  const tel = (v) => t(v, 30).replace(/[^\d+ ]/g, '');
  const v = {
    whatsapp: tel(b.whatsapp), telephone: tel(b.telephone), email: t(b.email, 120), adresse: t(b.adresse),
    essai_jours: Math.max(0, Math.min(365, parseInt(b.essai_jours, 10) || 0)),
  };
  await q("INSERT INTO platform_settings (key,value,updated_at) VALUES ('site',$1,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", [JSON.stringify(v)]);
  return v;
}

// Contacts publics d'Angy Company (affichés aux clients).
export async function getContact() {
  const s = await getSettings();
  return { whatsapp: s.whatsapp, telephone: s.telephone, email: s.email, adresse: s.adresse };
}
