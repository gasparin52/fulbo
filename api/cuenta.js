// Función de Vercel para la cuenta de cada usuario: mail de recuperación,
// "me olvidé la contraseña" y borrar la cuenta propia.
// El mail de recuperación se guarda en privado/{uid} (lo lee solo su dueño y lo
// escribe solo este servidor). Los links de los mails usan un código de un solo
// uso que se guarda hasheado en tokens/{hash}.
//
// Variables de entorno en Vercel:
//   FIREBASE_SERVICE_ACCOUNT  la misma que api/admin.js
//   RESEND_API_KEY            clave de resend.com para mandar los mails
//   MAIL_DESDE                remitente (por defecto "Fulbo <no-responder@fulbo5.com>")
import { createHash, randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';

const DOMINIO = 'fulbo.app';
const ORIGENES = ['https://fulbo5.com', 'https://www.fulbo5.com', 'https://gasparin52.github.io', 'https://fulbo-one.vercel.app', 'http://localhost:8791'];
const SITIO = 'https://fulbo5.com/';
const HORA = 3600e3;
const MAX_MAILS_DIA = 5;

// Con EXIGIR_APPCHECK=1 en Vercel, solo responde a la página de verdad (no a programas).
async function chequearAppCheck(req) {
  if (process.env.EXIGIR_APPCHECK !== '1') return;
  const t = req.headers['x-firebase-appcheck'];
  if (!t) throw new ErrorApi(401, 'Falta la verificación anti-bots. Recargá la página.');
  await getAppCheck().verifyToken(t).catch(() => { throw new ErrorApi(401, 'Verificación anti-bots inválida. Recargá la página.'); });
}

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

const hash = t => createHash('sha256').update(t).digest('hex');
const esperar = ms => new Promise(r => setTimeout(r, ms));
const mailValido = m => typeof m === 'string' && m.length <= 120 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(m);
const usuarioDe = email => (email || '').split('@')[0];

// Igual que claveSegura de index.html.
function claveSegura(p, usuario = '') {
  if (typeof p !== 'string' || p.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres';
  if (p.length > 100) return 'La contraseña es demasiado larga';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'La contraseña tiene que tener letras y números';
  if (usuario && p.toLowerCase().includes(usuario.toLowerCase())) return 'La contraseña no puede contener tu nombre de usuario';
  return '';
}

// Hasta MAX_MAILS_DIA mails por cuenta por día, y uno por minuto.
function limitar(p) {
  const ahora = Date.now();
  const envios = (p?.envios || []).filter(t => ahora - t < 24 * HORA);
  if (envios.length >= MAX_MAILS_DIA || envios.some(t => ahora - t < 60e3)) throw new ErrorApi(429, 'Ya te mandamos un mail hace poco. Revisá la carpeta de spam o probá más tarde.');
  return [...envios, ahora];
}

async function enviarMail(para, asunto, html) {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    // Con los emuladores el mail se muestra en la consola.
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return console.log(`\n[mail a ${para}] ${asunto}\n${html.match(/href="([^"]+)"/)?.[1]}\n`);
    throw new ErrorApi(500, 'Falta configurar el envío de mails (RESEND_API_KEY en Vercel)');
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_DESDE || 'Fulbo <no-responder@fulbo5.com>', to: [para], subject: asunto, html }),
  });
  if (!r.ok) {
    console.error('Resend', r.status, await r.text());
    throw new ErrorApi(502, 'No se pudo mandar el mail, probá más tarde');
  }
}
const plantilla = (titulo, texto, boton, link) => `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
    <p style="font-size:36px;margin:0">⚽</p>
    <h1 style="font-size:20px;margin:12px 0">${titulo}</h1>
    <p style="font-size:15px;line-height:1.5">${texto}</p>
    <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#10b981;color:#020617;font-weight:700;padding:12px 20px;border-radius:12px;text-decoration:none">${boton}</a></p>
    <p style="font-size:12px;color:#64748b;line-height:1.5">Si no fuiste vos, ignorá este mail.<br>Si el botón no anda, copiá este link en el navegador:<br>${link}</p>
  </div>`;

async function crearToken(datos, duracion) {
  const t = randomBytes(24).toString('base64url');
  await db.doc(`tokens/${hash(t)}`).set({ ...datos, vence: Date.now() + duracion });
  return t;
}
async function leerToken(t, tipo) {
  if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) throw new ErrorApi(400, 'El link no es válido');
  const ref = db.doc(`tokens/${hash(t)}`);
  const d = (await ref.get()).data();
  if (!d || d.tipo !== tipo || d.vence < Date.now()) {
    if (d) await ref.delete();
    throw new ErrorApi(400, 'El link venció o ya se usó. Pedí uno nuevo.');
  }
  return { ref, d };
}

async function mandarVerificacion(uid, email, mail, p, base) {
  const envios = limitar(p);
  const t = await crearToken({ tipo: 'verificar', uid, mail }, 48 * HORA);
  await enviarMail(mail, 'Confirmá tu mail en Fulbo', plantilla('Confirmá tu mail',
    `Lo vamos a usar solo para que puedas recuperar tu cuenta <b>${usuarioDe(email)}</b> si te olvidás la contraseña. No lo ve nadie más.`,
    'Confirmar mail', `${base}#/verificar/${t}`));
  await db.doc(`privado/${uid}`).set({ mail, verificado: false, envios, ts: Date.now() });
}

// Saca a alguien de un grupo (igual que en api/admin.js).
async function sacarDeGrupo(gid, uid) {
  const gref = db.doc(`grupos/${gid}`);
  await db.runTransaction(async tx => {
    const g = await tx.get(gref);
    if (!g.exists) return;
    const d = g.data();
    tx.update(gref, {
      anotados: (d.anotados || []).filter(x => x !== uid),
      admins: (d.admins || []).filter(x => x !== uid),
      publico: (d.publico || []).filter(x => x !== uid),
    });
  });
  const votos = gref.collection('votos');
  const [dados, recibidos] = await Promise.all([votos.where('voter', '==', uid).get(), votos.where('target', '==', uid).get()]);
  const batch = db.batch();
  [...dados.docs, ...recibidos.docs].forEach(d => batch.delete(d.ref));
  batch.delete(gref.collection('miembros').doc(uid));
  batch.delete(gref.collection('push').doc(uid));
  await batch.commit();
}

// Límite por conexión (IP) para lo que manda mails o no pide sesión: frena a los bots.
const POR_HORA = 20;
async function limitarIp(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (!ip) return;
  const ref = db.doc(`limites/${hash('ip:' + ip)}`);
  const ahora = Date.now();
  await db.runTransaction(async tx => {
    const d = (await tx.get(ref)).data();
    const vigente = d && ahora - d.desde < HORA;
    if (vigente && d.n >= POR_HORA) throw new ErrorApi(429, 'Demasiados pedidos desde esta conexión. Probá en un rato.');
    tx.set(ref, vigente ? { n: d.n + 1, desde: d.desde } : { n: 1, desde: ahora });
  });
}
const CON_LIMITE = ['olvide', 'nueva-clave', 'verificar', 'mail', 'reenviar'];

// Las que no piden sesión: el que se olvidó la contraseña no puede entrar.
const SIN_SESION = ['olvide', 'nueva-clave', 'verificar'];

const ACCIONES = {
  // Guarda (o cambia) el mail de recuperación y manda el link para confirmarlo.
  async mail({ mail }, quien, base) {
    mail = String(mail || '').trim().toLowerCase();
    if (!mailValido(mail)) throw new ErrorApi(400, 'Ese mail no parece válido');
    const p = (await db.doc(`privado/${quien.uid}`).get()).data();
    await mandarVerificacion(quien.uid, quien.email, mail, p, base);
    return { ok: true };
  },

  async reenviar(_, quien, base) {
    const p = (await db.doc(`privado/${quien.uid}`).get()).data();
    if (!p?.mail) throw new ErrorApi(400, 'Primero cargá tu mail');
    if (p.verificado) return { ok: true };
    await mandarVerificacion(quien.uid, quien.email, p.mail, p, base);
    return { ok: true };
  },

  async verificar({ token }) {
    const { ref, d } = await leerToken(token, 'verificar');
    await ref.delete();
    const pref = db.doc(`privado/${d.uid}`);
    if ((await pref.get()).data()?.mail !== d.mail) throw new ErrorApi(400, 'Ese mail ya se cambió por otro. Usá el link del último mail.');
    await pref.update({ verificado: true });
    return { ok: true, mail: d.mail };
  },

  // Con el usuario o el mail, manda un link para elegir contraseña nueva.
  // Responde siempre lo mismo, así no se puede averiguar quién tiene cuenta.
  async olvide({ dato }, _, base) {
    dato = String(dato || '').trim().toLowerCase();
    let uids = [];
    if (dato.includes('@')) {
      if (mailValido(dato)) uids = (await db.collection('privado').where('mail', '==', dato).where('verificado', '==', true).limit(3).get()).docs.map(d => d.id);
    } else if (/^[a-z0-9_.]{3,20}$/.test(dato)) {
      const c = await auth.getUserByEmail(`${dato}@${DOMINIO}`).catch(() => null);
      if (c) uids = [c.uid];
    }
    for (const uid of uids) {
      const pref = db.doc(`privado/${uid}`);
      const p = (await pref.get()).data();
      if (!p?.mail || !p.verificado) continue;
      let envios;
      try { envios = limitar(p); } catch { continue; }
      const usuario = usuarioDe((await auth.getUser(uid)).email);
      const t = await crearToken({ tipo: 'clave', uid }, HORA);
      await enviarMail(p.mail, 'Elegí una contraseña nueva para Fulbo', plantilla('¿Te olvidaste la contraseña?',
        `Tocá el botón para elegir una contraseña nueva para tu cuenta <b>${usuario}</b>. El link dura 1 hora.`,
        'Elegir contraseña nueva', `${base}#/clave/${t}`));
      await pref.update({ envios });
    }
    await esperar(300 + Math.random() * 400);
    return { ok: true };
  },

  async 'nueva-clave'({ token, password }) {
    const { ref, d } = await leerToken(token, 'clave');
    const usuario = usuarioDe((await auth.getUser(d.uid)).email);
    const error = claveSegura(password, usuario);
    if (error) throw new ErrorApi(400, error);
    await ref.delete();
    await auth.updateUser(d.uid, { password });
    await auth.revokeRefreshTokens(d.uid);  // cierra las sesiones abiertas
    return { ok: true, usuario };
  },

  // Borra la cuenta propia. Pide haber puesto la contraseña hace menos de 5 minutos.
  async 'borrar-cuenta'(_, quien) {
    if (Date.now() / 1000 - quien.auth_time > 300) throw new ErrorApi(401, 'Volvé a poner tu contraseña para confirmar');
    const ref = db.doc(`usuarios/${quien.uid}`);
    const s = await ref.get();
    for (const g of s.data()?.grupos || []) await sacarDeGrupo(g.id, quien.uid);
    await Promise.all([ref.delete(), db.doc(`privado/${quien.uid}`).delete()]);
    await auth.deleteUser(quien.uid);
    return { ok: true };
  },
};

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
    const accion = ACCIONES[body.accion];
    if (!accion) throw new ErrorApi(400, 'Acción desconocida');
    // Los links de los mails apuntan a la página desde donde se pidió.
    const base = !ORIGENES.includes(origen) ? SITIO : origen.endsWith('github.io') ? `${origen}/fulbo/` : `${origen}/`;
    if (CON_LIMITE.includes(body.accion)) await limitarIp(req);
    let quien = null;
    if (!SIN_SESION.includes(body.accion)) {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      quien = await auth.verifyIdToken(token).catch(() => { throw new ErrorApi(401, 'Sesión inválida, volvé a entrar'); });
    }
    res.status(200).json(await accion(body, quien, base));
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
}
