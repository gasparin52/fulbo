# Fulbo ⚽

App para que un grupo se anote al fulbo: cuentas con usuario y contraseña, grupos privados, fichas de jugador con estadísticas votadas por los compañeros, titulares y suplentes, equipos equilibrados y un botón para copiar la lista a WhatsApp.

- **Página**: `index.html`, publicada con GitHub Pages en <https://gasparin52.github.io/fulbo/>. Cada `git push` a `main` la actualiza.
- **Datos y login**: Firebase (Authentication + Firestore), proyecto `fulbo-5d6f5`.
- **Servidores** (funciones de Vercel en `api/`): `grupo.js` (votos secretos y entrar a grupos), `cuenta.js` (mail de recuperación, contraseña olvidada, borrar cuenta) y `avisar.js` (avisos, asistencia y fecha fija).

## Cómo funciona

- **Cuentas**: cada uno se registra con nombre de usuario, contraseña, edad, posición y foto (opcional). No se pide mail: por dentro Firebase guarda `usuario@fulbo.app`. La sesión dura 30 días.
- **Grupos**: cualquiera puede crear un grupo y queda como admin. Solo se entra con el **link de invitación** del grupo; quien no es miembro no ve nada. El admin puede generar un link nuevo (el viejo deja de andar) y expulsar gente (no puede volver a entrar).
- **🏠 Inicio** (`#/inicio`, la app arranca ahí): pestaña **Partidos y grupos** con la semana (puntito verde los días que jugás), el próximo partido de cada grupo ordenado por fecha con tu estado, aviso si dos partidos se pisan, anotarse sin entrar al grupo y "Agendar" (Google Calendar o .ics); tus grupos como tarjetas con **Entrar** y, si sos admin, **Administrar**; unirse y crear grupo. Las fechas que ya se jugaron no aparecen ("No hay más fechas próximas"). Pestaña **Calendario** (`#/calendario`): vista **Mes** o **Semana** (se recuerda), con flechas y "Hoy"; cada grupo con su color, en verde donde estás anotado y punteadas las fechas fijas que todavía no abrieron; tocando un día del mes ves sus partidos; abajo, los próximos. En el encabezado, si la app no está instalada, el botón **Instalar**: con Chrome abre su cartel de instalación (`beforeinstallprompt`); si no se puede (iPhone, otro navegador), muestra los pasos con pantallitas y qué hacer si tarda (en Xiaomi, el permiso de accesos directos de Chrome). Arriba, la tira **Tus números** (jugados, % ganados, ⭐ y los últimos 5). Pestaña **Mi perfil** (`#/perfil`) con dos solapas: **⚽ Mi ficha**, con la ficha técnica en chico (gráfico y barras; tocándola se amplía en pantalla entera, y el botón Atrás del celu la cierra, igual que cualquier cartel) combinada de todos tus grupos (promedio pesado por cantidad de votos, solo la ves vos), tu carrera (jugados, ganados, empates, perdidos, racha y forma) y la lista de partidos jugados; y **Configuración**: datos, lesión, salir de un grupo y cuenta (mail, contraseña, borrar). Dentro de un grupo, los admins tienen la pantalla **Administrar** (`#/admin`) con los pedidos para entrar, el partido, la fecha fija, el link y los jugadores.
- **🔁 Fecha fija** (panel admin): el grupo juega siempre el mismo día y hora (hasta 3 días por semana), guardado en `grupo.agenda` (`slots` y `saltear`). Cuando termina el partido y pasan las 6 h de lista cerrada, cualquiera que abra la app arma la votación del mejor y le pide a `api/avisar.js` (`tipo: "rotar"`) que vacíe la lista y abra la fecha siguiente. Al guardar el partido el admin elige si el cambio de día, hora o lugar es **solo para esa fecha** o **para todas las siguientes**, y tocando una de las próximas fechas la saltea (feriados). "Nueva fecha" también va a la siguiente. Sigue habiendo una sola lista abierta por grupo.
- **🧹 Sin fecha fija**: cuando cierra la votación del jugador del partido, la lista, los equipos y la tribuna quedan vacíos para la próxima (como "Nueva fecha"); lo hace `api/avisar.js` (`tipo: "rotar"`). Al cerrar la votación sale una notificación con el ganador (`tipo: "mvp"`, una sola vez: queda `avisado` en la votación).
- **Fichas**: cada jugador tiene 7 estadísticas del 1 al 10 (Velocidad, Técnica, Pase, Remate, Defensa, Resistencia y Arquero), con gráfico tipo PES. Las calificaciones sirven solo para equilibrar equipos. (Por dentro, Resistencia se guarda como `fisico`.) Los compañeros votan; cada uno tiene **un solo voto por compañero** (si lo cambia, reemplaza al anterior) y nadie se puede votar a sí mismo. Lo garantizan las reglas de Firestore, no solo la página.
- **🤕 Lesionado**: cada jugador se marca (y se desmarca) desde su ficha; aparece al lado de su nombre. Las reglas impiden que otro, ni siquiera un admin, lo cambie.
- **🛡️ Cuadro**: en la ficha cada uno elige de qué club es hincha (lista `CLUBES` en `index.html`, con los de Primera, algunos del Ascenso y los grandes de afuera). El escudo se dibuja con los colores del club (no son los escudos oficiales) y aparece en la ficha y en la tarjeta de Jugadores, no en las listas.
- **⭐ Calificar**: "⚡ Calificar rápido" (en Jugadores y, después del partido, en la tarjeta del jugador del partido) muestra de a uno a los que te faltan. En la ficha, tu voto queda oculto hasta tocar "Actualizar voto". 🧐 Scout: quien calificó al 80% o más del grupo.
- **😈 Hater**: etiqueta automática para quien, con 3 o más compañeros calificados, pone en promedio 3 o menos, o califica 2,5 puntos o más por debajo de lo que les ponen los demás a los mismos jugadores (solo habilidades de campo). Se va sola si ajusta sus votos. Los umbrales están en `HATER` en `index.html`.
- **General**: promedio de las 6 estadísticas de campo. Para los arqueros, mitad eso y mitad la de Arquero.
- **Equipos equilibrados**: prueba todas las formas de partir a los titulares en dos equipos del mismo tamaño (±1) y se queda con la de menor diferencia de puntaje (entre las que empatan, una al azar). Con más de 20 titulares usa serpentina A‑B‑B‑A‑A‑B… El puntaje es el general votado; si alguien todavía no tiene votos, se usa el nivel que pone el admin (por defecto 5, solo lo ven los admins). Si hay 2 o más arqueros, va uno a cada equipo. **Cuando se llena el cupo se arman solos** (equilibrados), en cuanto un admin o armador tenga la app abierta; si después los borran o los rearman a mano, no insiste hasta que cambie la lista. Los **suplentes** también quedan asignados a un equipo, equilibrados aparte de los titulares (en serpentina de mejor a peor; los que se anotan después van al que tiene menos suplentes o, si empatan, suplentes más flojos), y se pueden pasar de equipo igual que los titulares. Un botón copia solo los equipos para WhatsApp.
- **Editar equipos**: los admins y los **armadores** pasan jugadores de un equipo al otro con → / ←. Un admin designa armadores desde la ficha de cada jugador ("🛠️ Puede editar equipos"). Los armadores solo pueden armar y editar equipos y responder pedidos; no cambian el partido ni otras cosas del grupo.
- **Pedidos de cambio**: un jugador que está en un equipo puede tocar "Pedir pasar al otro equipo". Los admins y armadores lo aprueban o lo rechazan. Si se rearman los equipos, los pedidos pendientes se borran.
- **🙋 Pedir rehacer los equipos**: cualquiera que esté anotado (y no sea admin ni armador) puede pedir que se rehagan. Todos ven **cuántos** lo pidieron; **quiénes**, solo los admins. Los pedidos valen para la "ronda" de equipos actual: cuando se vuelven a armar, el contador vuelve a cero. Una barra muestra cuánto falta: con el **60% de los titulares** con cuenta (`PORCENTAJE_REHACER`) el primer admin o armador con la app abierta los rearma solo, equilibrados. Las reglas obligan a que el pedido y el contador se escriban juntos, así nadie puede inflar el número ni pedir dos veces.
- **🌦️ Clima**: el admin carga la **ciudad** en el panel (se busca con Open-Meteo, gratis y sin clave). Arriba aparece el pronóstico para la hora del partido (si la hora no es `HH:MM`, a las 20:00): cielo, temperatura, probabilidad de lluvia y viento. Solo hay pronóstico cuando faltan 16 días o menos. Si la red bloquea Open-Meteo, simplemente no se muestra.
- **🔔 Avisos**: si alguien se baja, si faltan jugadores para hoy o mañana, o si un admin **suspende** el partido (panel admin, con motivo), aparece un cartel arriba y sale una notificación a los que la activaron. Los arma `api/avisar.js` (Vercel) con los datos reales del grupo y cada aviso sale una sola vez. Las notificaciones usan Firebase Cloud Messaging: hace falta la clave pública en `CONFIG.vapid` (ver Configuración). En iPhone solo andan con la app agregada a la pantalla de inicio.
- **App instalable (PWA)**: `manifest.json`, `sw.js` y los íconos (`icono-192.png`, `icono-512.png`, `apple-touch-icon.png`) hacen que se pueda instalar desde el navegador, sin tiendas.
- **📋 Asistencia**: en cada ficha, el % de los últimos 90 días: partidos jugados contra faltas sin avisar (pesan 2), bajas de titulares a menos de 6 h del partido ("a último momento", pesan 1) y a menos de 24 h ("tarde", pesan ½). Las bajas las registra `api/avisar.js` en `grupos/{gid}/bajas` y no cuentan si el partido se suspendió o había lluvia pronosticada (≥60% o código de lluvia). Un admin puede perdonarlas. Con menos de 70% aparece ⏰ al lado del nombre.
- **⏱️ Día del partido**: el admin elige la **duración** (30 min a 2 h). Media hora antes se **cierran los equipos** (no se rearman solos ni se piden cambios). Durante el partido aparece **EN JUEGO** con cronómetro y equipos, y la lista queda cerrada hasta 6 h después de terminar. Bajarse con el partido empezado cuenta como **🟥 faltó sin avisar** (lo registra `api/avisar.js`). Al bajarse aparece un cartel que explica cómo afecta la asistencia. La hora se entiende aunque esté como "Viernes 20hs".
- **📣 Tribuna**: los que no juegan pero van a ir a ver tocan "Voy a la tribuna" y aparecen en una tarjeta debajo de los equipos, así saben quién más va. Si se anotan para jugar salen solos del público; "Nueva fecha" la vacía. Las reglas solo dejan que cada uno se agregue o se saque a sí mismo.
- **Reemplazar**: un admin toca "Reemplazar a alguien" abajo de la lista, elige a quién y después a otro (miembro, invitado o alguien nuevo sin cuenta). Entra en el mismo lugar y en el mismo equipo.
- **Invitados**: el admin puede anotar a alguien sin cuenta (nombre, posición y nivel). Tienen ficha y los compañeros los califican igual que a los demás.
- **🏆 Jugador del partido**: si el partido tiene **fecha** cargada (panel admin), se vota al mejor desde **una hora después de la hora del partido** hasta las 15:00 del día siguiente (hora argentina). La hora tiene que estar como `HH:MM` (la app convierte "20hs" o "20" a "20:00"); si no se entiende, abre a las 00:00 del día siguiente. Los candidatos son los titulares y los suplentes; un admin puede agregar o sacar a alguien. Votan todos los del grupo, uno por persona (se puede cambiar mientras esté abierta), nadie a sí mismo. Al entrar aparece un cartel para votar; si lo cerrás, queda la tarjeta "Todavía no votaste". Los votos se ven recién al cierre; con menos de 3 votos queda desierta. "Nueva fecha" guarda la votación con los titulares antes de vaciar la lista. Cada vez que alguien gana (o empata primero) suma una ⭐, que se ve en su ficha y en la lista.
- **🏁 Resultado**: al terminar el partido, un admin o armador carga cómo salió en la pestaña Partido. Según la opción del grupo (Administrar → Resultado del partido) es **solo quién ganó** (Ganó A / Empate / Ganó B, la opción por defecto), **con goles** (el marcador) o **goles y quién los hizo**: el admin o un armador anota cuántos hizo cada uno (más "en contra / no sé quién") y el marcador es la suma; se guarda en `goles` ({ uid: cantidad }) y sale en el resultado, el historial y las fichas. Siempre hay un atajo "No sé los goles". Se guarda en `grupos/{gid}/resultados/{fecha}` con los equipos con los que se jugó (titulares, suplentes `SA`/`SB` y sus `nombres`, por si alguien se va del grupo), y todos lo ven hasta el próximo partido ("Último partido"). Tocando **Ver los equipos** se despliegan los dos equipos con sus suplentes. Al final de la pestaña Partido, **Partidos jugados**: todas las fechas con resultado, el jugador del partido de cada una y los equipos. En la ficha de cada jugador, **Partidos**: jugados, ganados, empates y perdidos (cuentan los que tienen resultado cargado).
- **🟥 Faltó sin avisar**: los que jugaron (los candidatos del jugador del partido) pueden reportar, durante 3 días desde el día siguiente al partido, a alguien de la lista que no fue y no avisó. **Solo cuenta si un admin lo aprueba** (los admins ven quién reportó; el reportado no). Un admin también puede marcarlo desde la ficha, y sacar una tarjeta. La 🟥 se ve en la lista, la grilla y la ficha, y **vence cuando el jugador se anotó en 2 fechas** posteriores. **Castigo**: en la primera fecha en que se anota después de la falta, si se llena la lista, los que se anotan después le pasan adelante y él queda de suplente. Para que una fecha cuente, el partido tiene que tener **fecha** cargada (se guarda quiénes se anotaron al armar la votación del jugador del partido).
- **🔐 Versión pública** (`CONFIG.publico`, activa fuera de GitHub Pages, o sea en fulbo5.com): al registrarse se pide **mail de recuperación**, contraseña de 8+ caracteres con letras y números, y aceptar los **términos** (`#/terminos`) y la **privacidad** (`#/privacidad`); edad mínima 13. Los que ya tienen cuenta siguen con su sesión; **cuando vuelven a entrar**, si su contraseña no cumple se les pide una nueva, y si no tienen mail, que lo carguen. El mail se confirma con un link y queda en `privado/{uid}` (solo lo lee su dueño; lo escribe `api/cuenta.js`). "¿Te olvidaste la contraseña?" manda un link de 1 hora al mail confirmado. Desde "🔐 Tu cuenta" (en la ficha propia o en la pantalla de grupos) se cambia el mail, la contraseña o se **borra la cuenta**. Los mails salen por [Resend](https://resend.com) (ver Configuración).
- **🔒 Seguridad**: entrar con el link de invitación crea un **pedido** que un admin acepta o rechaza (`api/grupo.js`; opción "Un admin tiene que aceptar…" en el panel, activa por defecto). Los **votos son secretos**: los guarda el servidor, cada uno lee solo los suyos y todos ven los promedios en `calc/notas` (también el 😈 y el 🧐). Contraseñas de 8+ con letras y números (a los que tenían una débil se les pide cambiarla al volver a entrar). **Anti-bots**: Firebase App Check con reCAPTCHA v3 (`CONFIG.appCheck`; con `EXIGIR_APPCHECK=1` en Vercel los servidores rechazan lo que no venga de la página) y un límite de 20 pedidos por hora por conexión en lo que manda mails.

## Configuración (una sola vez)

### 1. Firebase

1. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar** (solo la primera opción) → Guardar.
2. **Firestore Database → Reglas**: borrá todo, pegá el contenido de [`firestore.rules`](firestore.rules) y tocá **Publicar**.

### 2. Vercel (servidores)

1. En Firebase: **⚙️ Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un archivo `.json`. **Es secreto**: no lo subas a GitHub ni lo mandes por chat.
2. Entrá a <https://vercel.com/signup> con **Continue with GitHub**.
3. **Add New… → Project** → importá `gasparin52/fulbo`.
4. Antes de tocar Deploy, abrí **Environment Variables** y agregá:
   - `FIREBASE_SERVICE_ACCOUNT`: abrí el `.json` con el Bloc de notas, copiá **todo** y pegalo como valor.
5. **Deploy**. Cuando termine, copiá el dominio (el nuestro es `fulbo-one.vercel.app`).
6. En `index.html`, `CONFIG.api` tiene que ser `https://ESE-DOMINIO/api/` para GitHub Pages (en Vercel es `/api/`).

### 3. Notificaciones al celu

Firebase → ⚙️ **Configuración del proyecto** → **Cloud Messaging** → **Certificados push web** → **Generar par de claves**. Copiá la clave (es pública) en `CONFIG.vapid` de `index.html`. El envío lo hace `api/avisar.js` con la misma `FIREBASE_SERVICE_ACCOUNT`.

Después borrá el `.json` descargado o guardalo en un lugar seguro.

## Mails (versión pública)

1. Creá una cuenta en <https://resend.com> y agregá el dominio `fulbo5.com` (Domains → Add). Te da unos registros DNS: cargalos en Cloudflare (DNS → Records) y esperá a que diga **Verified**.
2. En Resend → API Keys, creá una clave (permiso "Sending access").
3. En Vercel → Settings → Environment Variables agregá `RESEND_API_KEY` con esa clave y hacé **Redeploy**. Opcional: `MAIL_DESDE` (por defecto `Fulbo <no-responder@fulbo5.com>`).
4. Para el mail de contacto de los términos (`CONFIG.contacto`, `contacto@fulbo5.com`): en Cloudflare → Email → Email Routing, creá `contacto@` y que reenvíe a tu mail personal.

## Si alguien se olvida la contraseña

En la pantalla de entrar, **¿Te olvidaste la contraseña?** manda un link al mail de recuperación confirmado (se carga en "🔐 Tu cuenta"). Sin mail cargado no hay forma de recuperarla: ya no hay superadmin.

## Desarrollo local

```bash
python -m http.server 8791
```

Abrí <http://localhost:8791>. Usa la misma base de Firebase que la versión online.

## Limitaciones

- Con varias cuentas, una persona podría votar más de una vez al mismo compañero, pero solo si un admin acepta esas cuentas en el grupo.
- Los miembros pueden ver el código de invitación. Si alguien lo pasa afuera, igual tiene que aceptarlo un admin; y el admin puede generar uno nuevo.

## Ideas para más adelante

- **Arbitraje / planilla del partido** (opcional por grupo, pensado para la versión pública): primero cargar **qué equipo ganó**; después goles por jugador, cambios cuando entra un suplente, etc. Hoy no hay nadie que lo cargue, así que queda para después de ver si se respetan los equipos.
