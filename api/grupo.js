// Función de Vercel para lo del grupo que no puede hacer el navegador solo:
// - Votos secretos: cada voto lo guarda el servidor y recalcula los promedios en
//   grupos/{gid}/calc/notas (lo leen todos). Los votos sueltos los ve solo quien votó.
// - Entrar con el link: si el grupo pide aprobación, queda pendiente hasta que un admin
//   lo acepte (grupos/{gid}/pendientes/{uid}); si no, entra directo.
//
// Usa la misma variable FIREBASE_SERVICE_ACCOUNT que las otras funciones.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAppCheck } from 'firebase-admin/app-check';

const ORIGENES = ['https://fulbo5.com', 'https://www.fulbo5.com', 'https://gasparin52.github.io', 'https://fulbo-one.vercel.app', 'https://fulbo-5d6f5.web.app', 'https://fulbo-5d6f5.firebaseapp.com', 'http://localhost:8791'];
const STATS = ['velocidad', 'tecnica', 'pase', 'remate', 'defensa', 'fisico', 'arquero'];
const CAMPO = STATS.slice(0, 6);
// Igual que HATER de index.html.
const HATER = { minVotos: 3, maxPromedio: 3, maxDiferencia: -2.5 };

class ErrorApi extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let auth, db;
function iniciar() {
  if (auth) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new ErrorApi(500, 'Falta la variable FIREBASE_SERVICE_ACCOUNT en Vercel');
  const cuenta = JSON.parse(raw);
  if (typeof cuenta.private_key === 'string') cuenta.private_key = cuenta.private_key.replace(/\\n/g, '\n');
  if (!getApps().length) initializeApp({ credential: cert(cuenta) });
  auth = getAuth();
  db = getFirestore();
}

// Con EXIGIR_APPCHECK=1 en Vercel, solo responde a la página de verdad (no a programas).
async function chequearAppCheck(req) {
  if (process.env.EXIGIR_APPCHECK !== '1') return;
  const t = req.headers['x-firebase-appcheck'];
  if (!t) throw new ErrorApi(401, 'Falta la verificación anti-bots. Recargá la página.');
  await getAppCheck().verifyToken(t).catch(() => { throw new ErrorApi(401, 'Verificación anti-bots inválida. Recargá la página.'); });
}

const esMiembro = async (gid, uid) => (await db.doc(`grupos/${gid}/miembros/${uid}`).get()).exists;
const datosFicha = p => ({ usuario: p.usuario, edad: p.edad, posicion: p.posicion, foto: p.foto || '', lesionado: !!p.lesionado, cuadro: p.cuadro || '' });

// ---- Votos ----
// Recalcula todo desde los votos guardados: promedios por jugador, cuántos calificó
// cada uno (🧐 Scout) y quiénes son 😈 hater. Solo cuentan los votos de miembros actuales.
async function recalcular(gid) {
  const g = (await db.doc(`grupos/${gid}`).get()).data() || {};
  const miembros = new Set((await db.collection(`grupos/${gid}/miembros`).listDocuments()).map(d => d.id));
  const existe = id => miembros.has(id) || !!g.invitados?.[id];
  const porTarget = {};
  const votados = {};
  for (const d of (await db.collection(`grupos/${gid}/votos`).get()).docs) {
    const v = d.data();
    if (!miembros.has(v.voter) || !existe(v.target)) continue;
    (porTarget[v.target] ||= {})[v.voter] = v.stats;
    votados[v.voter] = (votados[v.voter] || 0) + 1;
  }
  const notas = {};
  for (const [t, vs] of Object.entries(porTarget)) {
    const lista = Object.values(vs);
    notas[t] = { n: lista.length, prom: Object.fromEntries(STATS.map(k => [k, lista.reduce((s, x) => s + (x[k] || 0), 0) / lista.length])) };
  }
  // Hater: igual que la cuenta que hacía index.html.
  const prom = s => CAMPO.reduce((t, k) => t + (s[k] || 0), 0) / CAMPO.length;
  const por = {};
  for (const vs of Object.values(porTarget)) {
    const voters = Object.keys(vs);
    for (const v of voters) {
      const otros = voters.filter(o => o !== v);
      (por[v] ||= []).push({ mio: prom(vs[v]), otros: otros.length ? otros.reduce((t, o) => t + prom(vs[o]), 0) / otros.length : null });
    }
  }
  const haters = [];
  for (const [v, xs] of Object.entries(por)) {
    if (xs.length < HATER.minVotos) continue;
    const media = xs.reduce((t, x) => t + x.mio, 0) / xs.length;
    const comp = xs.filter(x => x.otros !== null);
    const dif = comp.length >= HATER.minVotos ? comp.reduce((t, x) => t + x.mio - x.otros, 0) / comp.length : 0;
    if (media <= HATER.maxPromedio || dif <= HATER.maxDiferencia) haters.push(v);
  }
  await db.doc(`grupos/${gid}/calc/notas`).set({ notas, votados, haters, ts: Date.now() });
}

async function votar({ gid, target, stats }, uid) {
  if (typeof target !== 'string' || target === uid) throw new ErrorApi(400, 'No te podés calificar a vos mismo');
  if (!stats || Object.keys(stats).length !== STATS.length || !STATS.every(k => Number.isInteger(stats[k]) && stats[k] >= 1 && stats[k] <= 10)) throw new ErrorApi(400, 'Calificación inválida');
  const g = (await db.doc(`grupos/${gid}`).get()).data() || {};
  if (!(await esMiembro(gid, target)) && !g.invitados?.[target]) throw new ErrorApi(400, 'Ese jugador no está en el grupo');
  await db.doc(`grupos/${gid}/votos/${uid}_${target}`).set({ voter: uid, target, stats: Object.fromEntries(STATS.map(k => [k, stats[k]])), ts: Date.now() });
  await recalcular(gid);
  return { ok: true };
}

// ---- Entrar al grupo ----
async function avisarAdmins(gid, g, titulo, texto) {
  const docs = await Promise.all((g.admins || []).map(u => db.doc(`grupos/${gid}/push/${u}`).get()));
  const tokens = docs.flatMap(d => d.data()?.tokens || []);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({ tokens, webpush: { data: { titulo, texto, link: 'https://fulbo5.com/', tag: 'solicitud' } } }).catch(e => console.error(e));
}

async function unirse({ gid, codigo }, uid) {
  const gref = db.doc(`grupos/${gid}`), uref = db.doc(`usuarios/${uid}`);
  const [gs, us] = await Promise.all([gref.get(), uref.get()]);
  const g = gs.data();
  if (!g || typeof codigo !== 'string' || codigo !== g.codigo) throw new ErrorApi(403, 'El link de invitación no es válido o ya lo cambiaron. Pedile uno nuevo al admin.');
  if ((g.baneados || []).includes(uid)) throw new ErrorApi(403, 'No podés entrar a este grupo.');
  const p = us.data();
  if (!p) throw new ErrorApi(400, 'Primero completá tu ficha');
  const grupo = { id: gid, nombre: g.nombre || '' };
  if (await esMiembro(gid, uid)) return { estado: 'miembro', ...grupo };
  if (g.aprobacion === false) {
    await db.doc(`grupos/${gid}/miembros/${uid}`).set({ ...datosFicha(p), codigo: g.codigo, unido: Date.now() });
    await uref.update({ grupos: FieldValue.arrayUnion(grupo) });
    return { estado: 'miembro', ...grupo };
  }
  await db.doc(`grupos/${gid}/pendientes/${uid}`).set({ ...datosFicha(p), ts: Date.now() });
  await uref.update({ pendientes: FieldValue.arrayUnion(grupo) });
  await avisarAdmins(gid, g, `🙋 ${p.usuario} quiere entrar`, `Al grupo ${g.nombre}. Aceptalo o rechazalo desde la app.`);
  return { estado: 'pendiente', ...grupo };
}

async function decidir({ gid, id, aceptar }, uid) {
  const gref = db.doc(`grupos/${gid}`);
  const g = (await gref.get()).data() || {};
  if (!(g.admins || []).includes(uid)) throw new ErrorApi(403, 'Solo un admin');
  const pref = db.doc(`grupos/${gid}/pendientes/${id}`), uref = db.doc(`usuarios/${id}`);
  const [ps, us] = await Promise.all([pref.get(), uref.get()]);
  if (!ps.exists) return { ok: true };
  const pendiente = (us.data()?.pendientes || []).filter(x => x.id === gid);
  if (aceptar && us.exists && !(g.baneados || []).includes(id)) {
    await db.doc(`grupos/${gid}/miembros/${id}`).set({ ...datosFicha(us.data()), codigo: g.codigo, unido: Date.now() });
    await uref.update({ grupos: FieldValue.arrayUnion({ id: gid, nombre: g.nombre || '' }), ...(pendiente.length ? { pendientes: FieldValue.arrayRemove(...pendiente) } : {}) });
  } else if (us.exists && pendiente.length) {
    await uref.update({ pendientes: FieldValue.arrayRemove(...pendiente) });
  }
  await pref.delete();
  return { ok: true };
}

export default async function handler(req, res) {
  const origen = req.headers.origin;
  if (ORIGENES.includes(origen)) { res.setHeader('Access-Control-Allow-Origin', origen); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    iniciar();
    await chequearAppCheck(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { uid } = await auth.verifyIdToken(token).catch(() => { throw new ErrorApi(401, 'Sesión inválida, volvé a entrar'); });
    const gid = String(body.gid || '');
    if (!/^[a-z0-9-]{3,40}$/i.test(gid)) throw new ErrorApi(400, 'Grupo inválido');
    if (body.accion === 'unirse') return res.status(200).json(await unirse(body, uid));
    if (!(await esMiembro(gid, uid))) throw new ErrorApi(403, 'No sos del grupo');
    if (body.accion === 'votar') return res.status(200).json(await votar(body, uid));
    if (body.accion === 'recalcular') {
      const c = (await db.doc(`grupos/${gid}/calc/notas`).get()).data();
      if (!c || Date.now() - c.ts > 30e3) await recalcular(gid);
      return res.status(200).json({ ok: true });
    }
    if (body.accion === 'decidir') return res.status(200).json(await decidir(body, uid));
    throw new ErrorApi(400, 'Acción desconocida');
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
}
