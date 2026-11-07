// Copia de toda la base de Firestore a un JSON. Lo corre .github/workflows/backup.yml
// cada noche (ahí se comprime y se cifra). Uso: node scripts/backup.js salida.json
// Necesita FIREBASE_SERVICE_ACCOUNT (el mismo JSON que tiene Vercel).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, DocumentReference } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

// Fechas y referencias quedan marcadas para poder restaurarlas igual que estaban.
const aJson = v =>
  v instanceof Timestamp ? { __ts: v.toMillis() }
  : v instanceof DocumentReference ? { __ref: v.path }
  : Array.isArray(v) ? v.map(aJson)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aJson(x)]))
  : v;

// { coleccion: { docId: { _: datos, subcoleccion: { … } } } }
let total = 0;
async function copiar(colecciones) {
  const out = {};
  for (const col of colecciones) {
    const refs = await col.listDocuments();  // incluye docs vacíos que solo tienen subcolecciones
    const snaps = refs.length ? await db.getAll(...refs) : [];
    out[col.id] = {};
    for (const s of snaps) {
      const doc = { _: s.exists ? aJson(s.data()) : null };
      if (s.exists) total++;
      Object.assign(doc, await copiar(await s.ref.listCollections()));
      out[col.id][s.id] = doc;
    }
  }
  return out;
}

const datos = await copiar(await db.listCollections());
writeFileSync(process.argv[2] || 'backup.json', JSON.stringify({ fecha: new Date().toISOString(), datos }));
console.log(`Listo: ${total} documentos.`);
