# Fulbo ⚽

App para que un grupo se anote al fulbo: cuentas con usuario y contraseña, grupos privados, fichas de jugador con estadísticas votadas por los compañeros, titulares y suplentes, equipos equilibrados y un botón para copiar la lista a WhatsApp.

- **Página**: `index.html`, publicada con GitHub Pages en <https://gasparin52.github.io/fulbo/>. Cada `git push` a `main` la actualiza.
- **Datos y login**: Firebase (Authentication + Firestore), proyecto `fulbo-5d6f5`.
- **Servidor del superadmin**: `api/admin.js`, una función de Vercel (resetear contraseñas y administrar usuarios).

## Cómo funciona

- **Cuentas**: cada uno se registra con nombre de usuario, contraseña, edad, posición y foto (opcional). No se pide mail: por dentro Firebase guarda `usuario@fulbo.app`. La sesión dura 30 días.
- **Grupos**: cualquiera puede crear un grupo y queda como admin. Solo se entra con el **link de invitación** del grupo; quien no es miembro no ve nada. El admin puede generar un link nuevo (el viejo deja de andar) y expulsar gente (no puede volver a entrar).
- **Fichas**: cada jugador tiene 7 estadísticas del 1 al 10 (Velocidad, Técnica, Pase, Remate, Defensa, Físico y Arquero), con gráfico tipo PES. Los compañeros votan; cada uno tiene **un solo voto por compañero** (si lo cambia, reemplaza al anterior) y nadie se puede votar a sí mismo. Lo garantizan las reglas de Firestore, no solo la página.
- **General**: promedio de las 6 estadísticas de campo. Para los arqueros, mitad eso y mitad la de Arquero.
- **Equipos equilibrados**: ordena a los titulares por puntaje y los reparte en serpentina A‑B‑B‑A‑A‑B… El puntaje es el general votado; si alguien todavía no tiene votos, se usa el nivel que pone el admin (por defecto 5, solo lo ven los admins). Si hay 2 o más arqueros, va uno a cada equipo.
- **Editar equipos**: los admins y los **armadores** pasan jugadores de un equipo al otro con → / ←. Un admin designa armadores desde la ficha de cada jugador ("🛠️ Puede editar equipos"). Los armadores solo pueden armar y editar equipos y responder pedidos; no cambian el partido ni otras cosas del grupo.
- **Pedidos de cambio**: un jugador que está en un equipo puede tocar "Pedir pasar al otro equipo". Los admins y armadores lo aprueban o lo rechazan. Si se rearman los equipos, los pedidos pendientes se borran.
- **Invitados**: el admin puede anotar a alguien sin cuenta (nombre, posición y nivel).
- **Superadmin** (`gasparin`): tiene el panel **Usuarios** para ver a todos, crearlos, editarlos, borrarlos y ponerles una contraseña nueva.

## Configuración (una sola vez)

### 1. Firebase

1. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar** (solo la primera opción) → Guardar.
2. **Firestore Database → Reglas**: borrá todo, pegá el contenido de [`firestore.rules`](firestore.rules) y tocá **Publicar**.

### 2. Vercel (servidor del superadmin)

1. En Firebase: **⚙️ Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un archivo `.json`. **Es secreto**: no lo subas a GitHub ni lo mandes por chat.
2. Entrá a <https://vercel.com/signup> con **Continue with GitHub**.
3. **Add New… → Project** → importá `gasparin52/fulbo`.
4. Antes de tocar Deploy, abrí **Environment Variables** y agregá:
   - `FIREBASE_SERVICE_ACCOUNT`: abrí el `.json` con el Bloc de notas, copiá **todo** y pegalo como valor.
5. **Deploy**. Cuando termine, copiá el dominio (el nuestro es `fulbo-one.vercel.app`).
6. En `index.html`, `CONFIG.api` tiene que ser `https://ESE-DOMINIO/api/admin`.

Ojo: la red del trabajo bloquea `vercel.app`. Usá el panel de usuarios desde el celular con datos móviles.

Después borrá el `.json` descargado o guardalo en un lugar seguro.

## Si alguien se olvida la contraseña

El superadmin entra a **Usuarios** (link arriba a la derecha), toca 🔑 en esa persona y le pone una contraseña nueva. Los datos de acceso quedan copiados para mandárselos por WhatsApp.

## Desarrollo local

```bash
python -m http.server 8791
```

Abrí <http://localhost:8791>. Usa la misma base de Firebase que la versión online.

## Limitaciones

- Con varias cuentas, una persona podría votar más de una vez al mismo compañero. El admin puede expulsar esas cuentas y el superadmin, borrarlas.
- Los votos individuales no son secretos para alguien que sepa leer la base de datos con las herramientas del navegador. La página solo muestra promedios.
- Los miembros pueden ver el código de invitación. Si alguien lo pasa afuera, el admin genera uno nuevo.
