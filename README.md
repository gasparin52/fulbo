# Fulbo ⚽ – Anotate

Una página (`index.html`) para que el grupo se anote al fulbo, con titulares y suplentes, equipos equilibrados y un botón para copiar la lista a WhatsApp.

- **Jugadores**: crean su ficha una vez (nombre y posición), después tocan "¡Me anoto!" o "Me bajo". El celu los recuerda.
- **Admin** (botón 🔒 Admin al pie, PIN en `CONFIG.adminPin`): pone los niveles del 1 al 10 (por defecto 5), configura cupo/fecha/lugar, agrega o borra jugadores, arma los equipos (equilibrados o aleatorios) y empieza una fecha nueva.

## 1. Probarla ya

Abrí `index.html` en el navegador. Sin Firebase funciona en **modo local** (solo en ese navegador), ideal para probar.

## 2. Hacer que todos compartan la lista (Firebase, gratis)

1. Entrá a <https://console.firebase.google.com> → **Agregar proyecto** (podés desactivar Analytics).
2. Menú **Compilación → Firestore Database → Crear base de datos** → elegí una ubicación (ej. `southamerica-east1`) → modo **producción**.
3. En la pestaña **Reglas** de Firestore pegá esto y publicá:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /grupos/{grupo} {
         allow read, write: if true;
       }
     }
   }
   ```
4. **Configuración del proyecto (⚙️) → Tus apps → Web (`</>`)** → registrá la app → copiá el objeto `firebaseConfig`.
5. En `index.html`, pegalo en `CONFIG.firebase`:
   ```js
   firebase: {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   },
   ```
6. Cambiá `adminPin` por uno tuyo.

## 3. Subirla a internet (gratis)

La opción más rápida es **Netlify Drop**: entrá a <https://app.netlify.com/drop> y arrastrá la carpeta del proyecto. Te da un link `https://algo.netlify.app` para mandar al grupo. Con una cuenta gratis podés cambiarle el nombre al link y volver a subirla cuando hagas cambios.

Otra opción es **GitHub Pages**: subís `index.html` a un repo y activás *Settings → Pages*.

Cuando la página está online, el mensaje de WhatsApp incluye al final el link para anotarse.

## Cómo se arman los equipos

- **⚖️ Equilibrados**: ordena a los titulares de mayor a menor nivel (en los empates el orden se sortea) y los reparte en serpentina A‑B‑B‑A‑A‑B… Si hay 2 o más arqueros, pone uno en cada equipo primero. Si tocás el botón de nuevo, sale otra combinación igual de pareja.
- **🎲 Aleatorio**: sorteo puro.
- Si la lista de titulares cambia después de armar, aparece un aviso para volver a armarlos, y los equipos viejos no se incluyen en el mensaje de WhatsApp.

## Limitaciones (es un grupo de amigos, no un banco)

- No hay login: cualquiera con el link podría elegir el nombre de otro. El ❌ solo aparece en tu propia fila (el admin ve todos).
- El PIN de admin y los niveles se pueden ver mirando el código o la base de datos con las herramientas del navegador. Alcanza para que nadie se los cambie sin querer, pero no son secretos de verdad.
