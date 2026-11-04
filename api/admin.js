// Función de Vercel para lo que Firebase no deja hacer desde el navegador:
// crear, editar y borrar usuarios ajenos, y resetear contraseñas.
// Solo responde al superadmin (se verifica con el token de Firebase).
//
// Variables de entorno en Vercel:
//   FIREBASE_SERVICE_ACCOUNT  JSON de la cuenta de servicio (Firebase → Configuración → Cuentas de servicio)
//   SUPERADMINS               usuarios con acceso, separados por coma (por defecto "gasparin")
//   RECOVERY_CODE             frase secreta (16+ caracteres) para que el superadmin recupere su contraseña
import { timingSafeEqual, createHash } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DOMINIO = 'fulbo.app';
const SUPERADMINS = (process.env.SUPERADMINS || 'gasparin').split(',').map(s => s.trim().toLowerCase());
const ORIGENES = ['https://gasparin52.github.io', 'http://localhost:8791'];
const POSICIONES = ['comodin', 'arquero', 'defensor', 'medio', 'delantero'];

class ErrorApi extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Se inicializa en el primer pedido (no al cargar el módulo) para que un error
// de configuración se pueda devolver como mensaje en vez de tirar la función.
let auth, db;
function iniciar() {
  if (auth) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new ErrorApi(500, 'Falta la variable FIREBASE_SERVICE_ACCOUNT en Vercel (o se agregó después del último deploy: hacé Redeploy)');
  let cuenta;
  try {
    cuenta = JSON.parse(raw);
  } catch {
    throw new ErrorApi(500, 'FIREBASE_SERVICE_ACCOUNT no es un JSON válido: tiene que ser el contenido completo del archivo .json, de { a }');
  }
  if (typeof cuenta.private_key === 'string') cuenta.private_key = cuenta.private_key.replace(/\\n/g, '\n');
  if (cuenta.project_id !== 'fulbo-5d6f5') throw new ErrorApi(500, `La clave es del proyecto "${cuenta.project_id}", no de fulbo-5d6f5`);
  try {
    if (!getApps().length) initializeApp({ credential: cert(cuenta) });
  } catch (e) {
    throw new ErrorApi(500, 'La clave de FIREBASE_SERVICE_ACCOUNT no es válida: ' + e.message);
  }
  auth = getAuth();
  db = getFirestore();
}

const ERRORES_AUTH = {
  'auth/email-already-exists': 'Ese nombre de usuario ya existe',
  'auth/invalid-password': 'La contraseña tiene que tener al menos 6 caracteres',
  'auth/user-not-found': 'Ese usuario no existe',
};
const traducir = e => {
  throw ERRORES_AUTH[e.code] ? new ErrorApi(400, ERRORES_AUTH[e.code]) : e;
};

function validarUsuario(u) {
  if (typeof u !== 'string' || !/^[A-Za-z0-9_.]{3,20}$/.test(u)) throw new ErrorApi(400, 'Usuario inválido: letras, números, punto o guion bajo (3 a 20)');
}
function validarPassword(p) {
  if (typeof p !== 'string' || p.length < 6) throw new ErrorApi(400, 'La contraseña tiene que tener al menos 6 caracteres');
}
function validarPerfil({ edad, posicion }) {
  if (!Number.isInteger(edad) || edad < 13 || edad > 99) throw new ErrorApi(400, 'Poné una edad entre 13 y 99');
  if (!POSICIONES.includes(posicion)) throw new ErrorApi(400, 'Posición inválida');
}

async function usuariosAuth() {
  const todos = [];
  let token;
  do {
    const r = await auth.listUsers(1000, token);
    todos.push(...r.users);
    token = r.pageToken;
  } while (token);
  return todos;
}

// Saca a alguien de un grupo: lista, admins, ficha del grupo y votos dados o recibidos.
async function sacarDeGrupo(gid, uid) {
  const gref = db.doc(`grupos/${gid}`);
  await db.runTransaction(async tx => {
    const g = await tx.get(gref);
    if (!g.exists) return;
    const d = g.data();
    tx.update(gref, {
      anotados: (d.anotados || []).filter(x => x !== uid),
      admins: (d.admins || []).filter(x => x !== uid),
    });
  });
  const votos = gref.collection('votos');
  const [dados, recibidos] = await Promise.all([votos.where('voter', '==', uid).get(), votos.where('target', '==', uid).get()]);
  const batch = db.batch();
  [...dados.docs, ...recibidos.docs].forEach(d => batch.delete(d.ref));
  batch.delete(gref.collection('miembros').doc(uid));
  await batch.commit();
}

// Recuperación del superadmin: no hay sesión (se olvidó la contraseña), así que
// se autoriza con RECOVERY_CODE, que solo está en Vercel.
const igual = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
async function recuperar({ codigo, password }) {
  const secreto = process.env.RECOVERY_CODE || '';
  if (secreto.length < 16) throw new ErrorApi(403, 'La recuperación no está configurada: falta RECOVERY_CODE en Vercel (mínimo 16 caracteres) y hacer Redeploy');
  if (typeof codigo !== 'string' || !igual(codigo.trim(), secreto.trim())) {
    await new Promise(r => setTimeout(r, 2000));  // frena a quien pruebe códigos al azar
    throw new ErrorApi(403, 'Código de recuperación incorrecto');
  }
  validarPassword(password);
  const usuario = SUPERADMINS[0];
  const cuenta = await auth.getUserByEmail(`${usuario}@${DOMINIO}`).catch(() => {
    throw new ErrorApi(404, `La cuenta "${usuario}" no existe: registrala de nuevo desde "Crear cuenta"`);
  });
  await auth.updateUser(cuenta.uid, { password });
  await auth.revokeRefreshTokens(cuenta.uid);
  return { ok: true, usuario };
}

const ACCIONES = {
  async listar() {
    const [snap, cuentas] = await Promise.all([db.collection('usuarios').get(), usuariosAuth()]);
    const perfiles = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    return {
      usuarios: cuentas.map(c => {
        const p = perfiles[c.uid];
        return {
          uid: c.uid,
          usuario: p?.usuario || (c.email || '').split('@')[0],
          edad: p?.edad ?? null,
          posicion: p?.posicion || 'comodin',
          foto: p?.foto || '',
          grupos: p?.grupos || [],
          sinFicha: !p,
          ultimoIngreso: c.metadata.lastSignInTime || null,
        };
      }),
    };
  },

  async crear({ usuario, password, edad, posicion }) {
    validarUsuario(usuario);
    validarPassword(password);
    validarPerfil({ edad, posicion });
    const c = await auth.createUser({ email: `${usuario.toLowerCase()}@${DOMINIO}`, password }).catch(traducir);
    await db.doc(`usuarios/${c.uid}`).set({ usuario, edad, posicion, foto: '', grupos: [], creado: Date.now() });
    return { uid: c.uid };
  },

  async editar({ uid, edad, posicion, foto }) {
    validarPerfil({ edad, posicion });
    const datos = { edad, posicion };
    if (foto !== undefined) {
      if (foto !== '') throw new ErrorApi(400, 'Desde el panel solo se puede quitar la foto');
      datos.foto = '';
    }
    const ref = db.doc(`usuarios/${uid}`);
    const s = await ref.get();
    if (!s.exists) throw new ErrorApi(404, 'Ese usuario no completó su ficha todavía');
    const batch = db.batch();
    batch.update(ref, datos);
    // La ficha está copiada en cada grupo: la actualizo en todos.
    for (const g of s.data().grupos || []) {
      const m = db.doc(`grupos/${g.id}/miembros/${uid}`);
      if ((await m.get()).exists) batch.update(m, datos);
    }
    await batch.commit();
    return { ok: true };
  },

  async password({ uid, password }) {
    validarPassword(password);
    await auth.updateUser(uid, { password }).catch(traducir);
    await auth.revokeRefreshTokens(uid);  // cierra sus sesiones abiertas
    return { ok: true };
  },

  async borrar({ uid }, quien) {
    if (uid === quien.uid) throw new ErrorApi(400, 'No te podés borrar a vos mismo');
    const ref = db.doc(`usuarios/${uid}`);
    const s = await ref.get();
    for (const g of s.data()?.grupos || []) await sacarDeGrupo(g.id, uid);
    await ref.delete();
    await auth.deleteUser(uid).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
    return { ok: true };
  },
};

export default async function handler(req, res) {
  const origen = req.headers.origin;
  if (ORIGENES.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET: chequeo de configuración (no expone nada secreto).
  if (req.method === 'GET') {
    try {
      iniciar();
      return res.status(200).json({ ok: true, mensaje: 'Servidor configurado' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    iniciar();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.accion === 'recuperar') return res.status(200).json(await recuperar(body));

    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const quien = await auth.verifyIdToken(token).catch(() => { throw new ErrorApi(401, 'Sesión inválida, volvé a entrar'); });
    const [usuario, dominio] = (quien.email || '').split('@');
    if (dominio !== DOMINIO || !SUPERADMINS.includes(usuario)) throw new ErrorApi(403, 'Solo el superadmin puede hacer esto');

    const accion = ACCIONES[body.accion];
    if (!accion) throw new ErrorApi(400, 'Acción desconocida');
    res.status(200).json(await accion(body, quien));
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
}
