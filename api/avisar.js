// Función de Vercel para los avisos importantes del partido: alguien se bajó,
// faltan jugadores o se suspendió. Guarda el aviso en el grupo (lo ven todos en
// la app) y manda una notificación a los celulares que la activaron.
// El texto lo arma el servidor con los datos del grupo, no el que llama, y cada
// aviso sale una sola vez (para que nadie pueda mandar spam).
//
// Usa la misma variable FIREBASE_SERVICE_ACCOUNT que api/admin.js.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const ORIGENES = ['https://gasparin52.github.io', 'http://localhost:8791'];
const LINK = 'https://gasparin52.github.io/fulbo/';
const MAX_AVISOS = 8;
const DIA = 864e5;

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

const hoyArg = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const diasHasta = f => Math.round((Date.parse(f + 'T12:00:00Z') - Date.parse(hoyArg() + 'T12:00:00Z')) / DIA);
const cuando = f => ({ 0: 'hoy', 1: 'mañana' }[diasHasta(f)] || 'el ' + new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' }));

async function nombreDe(gid, g, id) {
  if (g.invitados?.[id]) return g.invitados[id].nombre;
  return (await db.doc(`grupos/${gid}/miembros/${id}`).get()).data()?.usuario || 'Alguien';
}

// Arma el aviso a partir del estado real del grupo. null = no corresponde avisar.
// "para": a quiénes notificar (null = a todos menos el que lo provocó).
async function armarAviso(gid, g, tipo, datos, quien) {
  const p = g.partido || {};
  const cupo = Number(p.cupo) || 10;
  const anotados = g.anotados || [];
  const futuro = p.fecha && diasHasta(p.fecha) >= 0;
  if (tipo === 'baja') {
    const id = String(datos.id || '');
    if (!futuro || p.suspendido || !id || anotados.includes(id)) return null;
    const nombre = await nombreDe(gid, g, id);
    const resto = anotados.length >= cupo ? 'Sube el primer suplente.' : `Quedan ${anotados.length}/${cupo} para ${cuando(p.fecha)}.`;
    return { clave: `baja:${id}:${p.fecha}:${anotados.length}`, titulo: `😢 ${nombre} se bajó`, texto: resto, para: null };
  }
  if (tipo === 'faltan') {
    const faltan = cupo - anotados.length;
    if (!futuro || p.suspendido || faltan <= 0 || diasHasta(p.fecha) > 1) return null;
    const miembros = await db.collection(`grupos/${gid}/miembros`).listDocuments();
    return {
      clave: `faltan:${p.fecha}:${hoyArg()}`,
      titulo: `⚠️ ${faltan === 1 ? 'Falta 1' : `Faltan ${faltan}`} para ${cuando(p.fecha)}`,
      texto: `Somos ${anotados.length}/${cupo}. Si podés, anotate.`,
      para: miembros.map(m => m.id).filter(id => !anotados.includes(id)),
    };
  }
  if (tipo === 'suspendido' || tipo === 'reactivado') {
    if (!(g.admins || []).includes(quien)) throw new ErrorApi(403, 'Solo un admin');
    if (tipo === 'suspendido' && !p.suspendido) return null;
    if (tipo === 'reactivado' && p.suspendido) return null;
    const fecha = p.fecha ? ` de ${cuando(p.fecha)}` : '';
    return tipo === 'suspendido'
      ? { clave: `susp:${p.fecha}:${p.suspendido}`, titulo: `🚫 Se suspendió el partido${fecha}`, texto: p.suspendido === true ? 'Atentos al grupo.' : String(p.suspendido), para: null }
      : { clave: `vuelve:${p.fecha}:${Date.now() >> 22}`, titulo: `✅ El partido${fecha} sigue en pie`, texto: 'Se levantó la suspensión.', para: null };
  }
  throw new ErrorApi(400, 'Aviso desconocido');
}

// ---- Asistencia ----
// Una baja de titular a menos de 24 h del partido cuenta como "tarde"; a menos de 6 h,
// como "a último momento". No cuenta si estaba suspendido o se pronosticaba lluvia.
const HORA_DEFAULT = '20:00';
const horaDe = p => (/^([01]\d|2[0-3]):[0-5]\d$/.test(p.cuando || '') ? p.cuando : HORA_DEFAULT);
const horasAntes = p => (Date.parse(`${p.fecha}T${horaDe(p)}:00-03:00`) - Date.now()) / 3600e3;
async function llueve(g, p) {
  const c = g.ciudad;
  if (!c?.lat) return false;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
      + `&hourly=precipitation_probability,weather_code&timezone=America%2FArgentina%2FBuenos_Aires&start_date=${p.fecha}&end_date=${p.fecha}`);
    const h = (await r.json()).hourly;
    const i = h.time.indexOf(`${p.fecha}T${horaDe(p).slice(0, 2)}:00`);
    const codigo = h.weather_code[i];
    return h.precipitation_probability[i] >= 60 || (codigo >= 51 && codigo <= 67) || codigo >= 80;
  } catch (e) {
    console.warn(e);
    return false;
  }
}
async function registrarBaja(gid, g, id, titular, por) {
  const p = g.partido || {};
  if (!titular || !id || !p.fecha || (g.anotados || []).includes(id) || g.invitados?.[id]) return;
  const horas = horasAntes(p);
  if (horas >= 24 || horas < -3) return;  // con tiempo, o ya terminado: no cuenta
  const excusa = p.suspendido ? 'suspendido' : (await llueve(g, p)) ? 'lluvia' : null;
  await db.doc(`grupos/${gid}/bajas/${p.fecha}_${id}`).set({
    fecha: p.fecha, target: id, tipo: horas < 6 ? 'ultimo' : 'tarde',
    horas: Math.max(0, Math.round(horas * 10) / 10), excusa, por, ts: Date.now(),
  });
}
async function excusarBajas(gid, fecha, excusa) {
  if (!fecha) return;
  const qs = await db.collection(`grupos/${gid}/bajas`).where('fecha', '==', fecha).get();
  await Promise.all(qs.docs.map(d => d.ref.update({ excusa })));
}

async function notificar(gid, uids, aviso) {
  const docs = await Promise.all(uids.map(u => db.doc(`grupos/${gid}/push/${u}`).get()));
  const tokens = docs.flatMap(d => d.data()?.tokens || []);
  if (!tokens.length) return 0;
  const r = await getMessaging().sendEachForMulticast({
    tokens,
    webpush: { data: { titulo: aviso.titulo, texto: aviso.texto, link: LINK, tag: aviso.clave.split(':')[0] } },
  });
  // Tokens vencidos (desinstaló, borró datos…): se limpian.
  const muertos = tokens.filter((t, i) => ['messaging/registration-token-not-registered', 'messaging/invalid-argument']
    .includes(r.responses[i].error?.code));
  await Promise.all(docs.filter(d => d.exists && d.data().tokens?.some(t => muertos.includes(t)))
    .map(d => d.ref.update({ tokens: FieldValue.arrayRemove(...muertos) })));
  return r.successCount;
}

export default async function handler(req, res) {
  const origen = req.headers.origin;
  if (ORIGENES.includes(origen)) { res.setHeader('Access-Control-Allow-Origin', origen); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    iniciar();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { uid } = await auth.verifyIdToken(token).catch(() => { throw new ErrorApi(401, 'Sesión inválida'); });
    const gid = String(body.gid || '');
    if (!gid || !(await db.doc(`grupos/${gid}/miembros/${uid}`).get()).exists) throw new ErrorApi(403, 'No sos del grupo');

    const ref = db.doc(`grupos/${gid}`);
    // Asistencia: bajas tardías y, si se suspende, perdonarlas.
    if (body.tipo === 'baja' || body.tipo === 'suspendido') {
      const g = (await ref.get()).data() || {};
      if (body.tipo === 'baja') await registrarBaja(gid, g, String(body.id || ''), body.titular === true, uid);
      else if (g.partido?.suspendido && (g.admins || []).includes(uid)) await excusarBajas(gid, g.partido.fecha, 'suspendido');
    }
    // La transacción evita que dos avisos iguales salgan a la vez.
    const aviso = await db.runTransaction(async tx => {
      const g = (await tx.get(ref)).data() || {};
      const a = await armarAviso(gid, g, body.tipo, body, uid);
      if (!a || (g.avisos || []).some(x => x.clave === a.clave)) return null;
      const nuevo = { id: Math.random().toString(36).slice(2, 10), clave: a.clave, titulo: a.titulo, texto: a.texto, ts: Date.now() };
      tx.update(ref, { avisos: [...(g.avisos || []), nuevo].slice(-MAX_AVISOS) });
      return a;
    });
    if (!aviso) return res.status(200).json({ ok: true, enviado: false });

    const miembros = aviso.para || (await db.collection(`grupos/${gid}/miembros`).listDocuments()).map(m => m.id);
    const enviados = await notificar(gid, miembros.filter(u => u !== uid), aviso).catch(e => { console.error(e); return 0; });
    res.status(200).json({ ok: true, enviado: true, notificaciones: enviados });
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
}
