// Datos de ejemplo para regenerar las capturas de la landing (capturas/*.jpg).
// Se usa en una copia local de index.html que expone window.__t = { D, ui, normGrupo, pintar, $, vistaPrincipal, vistaInicio, vistaFicha, modalCancha }
// y carga html-to-image; foto() manda cada imagen a un servidor local que la guarda.

const t = window.__t, D = t.D;
const nombres = ['tincho', 'rama_10', 'pepe', 'nico.g', 'juanma', 'lucho', 'fede', 'gonza', 'mati', 'santi', 'facu', 'bruno'];
const posiciones = ['medio', 'delantero', 'defensor', 'arquero', 'medio', 'delantero', 'defensor', 'comodin', 'arquero', 'medio', 'delantero', 'defensor'];
const cuadros = ['boca', 'river', 'racing', 'independiente', 'san-lorenzo', 'boca', 'river', 'velez', 'boca', 'huracan', 'river', 'racing'];
const ids = nombres.map((_, i) => 'u' + (i + 1));
const fecha = '2026-11-12';
D.user = { uid: 'u1', getIdToken: async () => '', metadata: {} };
D.perfil = { usuario: 'tincho', posicion: 'medio', edad: 31, cuadro: 'boca', grupos: [{ id: 'g1', nombre: 'Fulbo del jueves' }, { id: 'g2', nombre: 'Los del laburo' }] };
D.privado = { mail: 'x@x.com', verificado: true };
D.miembros = Object.fromEntries(ids.map((id, i) => [id, { id, usuario: nombres[i], posicion: posiciones[i], cuadro: cuadros[i], edad: 24 + (i * 3) % 15, foto: '' }]));
D.gid = 'g1';
const titulares = ids.slice(0, 10);
D.grupo = t.normGrupo({
  nombre: 'Fulbo del jueves', admins: ['u9'], armadores: [],
  partido: { fecha, cuando: '21:00', lugar: 'Cancha 3 · Palermo', cupo: 10, duracion: 60 },
  anotados: ids.slice(0, 11), publico: ['u12'],
  agenda: { slots: [{ dia: 4, hora: '21:00', lugar: 'Cancha 3 · Palermo' }], saltear: [] },
});
Object.assign(D.cargado, { votos: true, niveles: true, mvps: true, faltas: true });
window.__demo = { ids, titulares, fecha };

// Equipos armados, con algunas posiciones elegidas.
window.conEquipos = () => {
  D.grupo.equipos = {
    A: ['u1', 'u3', 'u5', 'u7', 'u9'], B: ['u2', 'u4', 'u6', 'u8', 'u10'], SA: ['u11'], SB: [],
    base: [...titulares].sort().join(','), modo: 'equilibrado', ronda: 1,
    pos: { u1: 'A2', u9: 'A0', u3: 'A1', u4: 'B0', u2: 'B4', u6: 'B3' },
  };
};

// Foto en alta de un elemento (recortada a `alto` px) que guarda el servidor de capturas.
window.foto = async (nombre, el = document.body, alto = 760) => {
  const url = await htmlToImage.toJpeg(el, { pixelRatio: 2, quality: 0.88, width: el.offsetWidth, height: Math.min(alto, el.scrollHeight), backgroundColor: '#020617', skipFonts: true, style: { margin: '0' } });
  const r = await fetch('/guardar?n=' + nombre, { method: 'POST', body: url });
  return nombre + ': ' + (await r.text()) + ' ' + Math.round(url.length / 1024) + 'KB';
};

// Calificaciones, partidos jugados y veces que fue el mejor (para la ficha y los equipos).
const nivel = [7, 8, 6, 6, 7, 8, 5, 6, 7, 6, 7, 5];
D.votos = {};
ids.forEach((id, i) => {
  D.votos[id] = {};
  ids.forEach((v, j) => {
    if (v === id || (i + j) % 3 === 0) return;
    const b = nivel[i], s = k => Math.max(1, Math.min(10, b + ((i * 7 + j * 3 + k) % 5) - 2));
    D.votos[id][v] = { velocidad: s(1), tecnica: s(2), pase: s(3), remate: s(4), defensa: s(5) - 1, fisico: s(6), arquero: posiciones[i] === 'arquero' ? s(7) + 1 : 3 };
  });
});
D.estrellas = { u2: 4, u1: 2, u6: 1 };
D.resultados = ['2026-11-05', '2026-10-29', '2026-10-22', '2026-10-15', '2026-10-08', '2026-10-01'].map((f, k) => ({
  id: f, fecha: f, ganador: k % 3 === 2 ? 'empate' : k % 2 ? 'B' : 'A',
  A: k % 2 ? ['u2', 'u4', 'u6', 'u8', 'u10'] : ['u1', 'u3', 'u5', 'u7', 'u9'],
  B: k % 2 ? ['u1', 'u3', 'u5', 'u7', 'u9'] : ['u2', 'u4', 'u6', 'u8', 'u10'],
  golesA: [7, 6, 4, 8, 5, 6][k], golesB: [5, 4, 4, 6, 3, 2][k],
}));

// Votación del mejor del partido, recién cerrada.
window.conMvp = () => {
  const votos = {};
  ['u1', 'u3', 'u4', 'u5', 'u7'].forEach(v => (votos[v] = 'u2'));
  ['u6', 'u8', 'u9'].forEach(v => (votos[v] = 'u6'));
  ['u2', 'u10'].forEach(v => (votos[v] = 'u4'));
  D.mvp = { id: '2026-11-05', candidatos: titulares, nombres: {}, abre: Date.now() - 20 * 36e5, cierra: Date.now() - 36e5, miVoto: 'u2', votos };
};

// Pinta una vista sin pasar por render() (así no intenta guardar nada).
window.escena = (hash, html, modal = '') => {
  history.replaceState(null, '', hash);
  t.pintar(t.$('#app'), html());
  t.pintar(t.$('#modal'), modal ? modal() : '');
  t.$('#nav').innerHTML = '';
  scrollTo(0, 0);
};

// Los grupos del usuario (para Inicio y Calendario).
D.misGrupos = {
  g1: D.grupo,
  g2: t.normGrupo({ nombre: 'Los del laburo', admins: ['u1'], partido: { fecha: '2026-11-17', cuando: '19:30', lugar: 'Club Ferro', cupo: 14, duracion: 60 }, anotados: ['u1', 'u5', 'u7', 'u11', 'u12', 'u3', 'u9', 'u2'], agenda: { slots: [{ dia: 2, hora: '19:30', lugar: 'Club Ferro' }], saltear: [] } }),
};

// Torneo terminado (capturas/torneo.jpg, en #/torneo) y un rival de amistoso (capturas/amistosos.jpg, en #/amistoso).
// Cada equipo con el nombre y la camiseta que eligió su capitán.
window.conTorneoYAmistosos = () => {
  const P = (f, a, b, ga, gb) => ({ f, a, b, ga, gb });
  const ids = Object.keys(D.miembros);
  D.grupo.torneo = {
    nombre: 'Copa de noviembre', estado: 'terminado', ids, cant: 4, formato: 'liga', vueltas: 1, modo: 'equilibrado',
    cuando: { tipo: 'grupo' }, arbitro: 'nadie', creado: 1, empezo: Date.now(), termino: Date.now(), llave: null, res: {},
    equipos: [0, 1, 2, 3].map(i => ({ nombre: '', ids: ids.slice(i * 3, i * 3 + 3) })),
    partidos: [P(1, 0, 3, 4, 2), P(1, 1, 2, 3, 3), P(2, 0, 2, 5, 1), P(2, 3, 1, 1, 2), P(3, 0, 1, 2, 2), P(3, 2, 3, 3, 0)],
  };
  D.torneoEquipos = {
    0: { torneo: 1, nombre: 'La Academia', colores: ['celeste', 'blanco'], diseno: 'bastones' },
    1: { torneo: 1, nombre: 'Los Xeneizes', colores: ['azul', 'amarillo'], diseno: 'franja' },
    2: { torneo: 1, nombre: 'Los Millos', colores: ['blanco', 'rojo'], diseno: 'banda' },
    3: { torneo: 1, nombre: 'Muertos FC', colores: ['negro'], diseno: 'lisa' },
  };
  D.torneoResultados = {};
  // Amistoso compartido con otro grupo (amistosos/{id}): el que viene, con la planilla de cada lado, y los ya jugados.
  // En la copia, seguirVs() no tiene que suscribirse a nada (window.__demoLocal).
  const vs = (fecha, resultado) => ({ local: { gid: 'g1', nombre: D.grupo.nombre }, rival: { gid: 'g7', nombre: 'Los del laburo' }, creador: 'u9', admins: ['u9'],
    fecha, hora: '10:00', lugar: 'Club Ferro', cupo: 5, suspendido: false, resultado, ts: Date.parse(fecha) });
  const jugados = [['2026-11-07', 5, 3], ['2026-10-31', 4, 4], ['2026-10-24', 2, 3], ['2026-10-17', 6, 2]];
  D.vs = { prox: vs('2026-11-21', null), ...Object.fromEntries(jugados.map(([f, ga, gb], k) => ['j' + k, vs(f, { ga, gb })])) };
  const ellos = ['carlitos', 'el_ruso', 'pela', 'chino'];
  D.vsAnot = { prox: [...ids.slice(0, 5).map((id, k) => ({ id, lado: 'A', usuario: D.miembros[id].usuario, foto: '', ts: k })),
    ...ellos.map((usuario, k) => ({ id: 'r' + k, lado: 'B', usuario, foto: '', ts: 10 + k }))] };
  D.grupo.amistosos = Object.keys(D.vs).map(id => ({ id, rival: 'Los del laburo', lado: 'A', ts: D.vs[id].ts }));
};
