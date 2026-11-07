// Vuelve a escribir en Firestore un backup hecho con scripts/backup.js (ya descifrado y descomprimido).
//   node scripts/restaurar.js backup.json                    → muestra qué escribiría, sin tocar nada
//   node scripts/restaurar.js backup.json grupos/abc123 --si → restaura solo ese grupo (y lo de adentro)
//   node scripts/restaurar.js backup.json --si               → restaura todo
// Pisa los documentos que estén en el backup; lo que se creó después no se borra.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const [archivo, ...resto] = process.argv.slice(2);
const confirmar = resto.includes('--si');
const solo = resto.find(x => x !== '--si') || '';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const deJson = v =>
  Array.isArray(v) ? v.map(deJson)
  : v && typeof v === 'object' ? ('__ts' in v ? Timestamp.fromMillis(v.__ts) : '__ref' in v ? db.doc(v.__ref)
    : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deJson(x)])))
  : v;

const docs = [];
function juntar(colecciones, base) {
  for (const [col, ds] of Object.entries(colecciones)) {
    for (const [id, { _, ...subs }] of Object.entries(ds)) {
      const ruta = `${base}${col}/${id}`;
      if (_ && (ruta === solo || ruta.startsWith(solo ? solo + '/' : ''))) docs.push([ruta, _]);
      juntar(subs, ruta + '/');
    }
  }
}
const { fecha, datos } = JSON.parse(readFileSync(archivo, 'utf8'));
juntar(datos, '');
console.log(`Backup del ${fecha}: ${docs.length} documentos${solo ? ` dentro de ${solo}` : ''}.`);
if (!confirmar) { console.log('No se escribió nada. Agregá --si para restaurar.'); process.exit(0); }

for (let i = 0; i < docs.length; i += 400) {
  const lote = db.batch();
  for (const [ruta, d] of docs.slice(i, i + 400)) lote.set(db.doc(ruta), deJson(d));
  await lote.commit();
}
console.log('Restaurado.');
