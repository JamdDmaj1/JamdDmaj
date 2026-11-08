# Total consolidado en Activos — cambio local, sin publicar

Fecha: 2026-11-07. Árbol: `bot-manual-release` (rama `codex/bot-wallet-manual-futures`).
No se publicó, no se desplegó y no se modificó ninguna base ni servicio.

## Qué añade

Una tarjeta "Total de tu dinero" al inicio de **Activos**, encima de la tarjeta
de la billetera seleccionada:

- Total estimado = suma del valor en USD de **todas las billeteras vinculadas**
  (nativa, externa y de solo consulta) + **colateral** de las posiciones de
  futuros abiertas de la billetera del bot.
- Desglose por billetera (nombre · dirección corta · valor) y una fila de
  futuros con el número de posiciones.
- Botón **Actualizar**; además refresca sola cada 60 s y cuando cambia la
  cartera seleccionada.

## Reglas que respeta

- Solo lectura: no firma, no abre sesión, no crea ni modifica datos.
- Nunca sustituye un dato ausente por cero: una billetera que no responde se
  muestra como "No disponible" y el total se marca como **parcial**.
- Si no se pueden leer los futuros, no se muestra un total: se indica que falta
  leer una parte.
- El colateral **no** incluye ganancia o pérdida abierta; no se presenta como
  PnL ni como saldo bancario.
- No amplía permisos: usa el mismo endpoint público de cartera que ya usaba la
  pantalla y la misma acción autenticada de lectura de posiciones que usa el
  panel de Futuros.

## Archivos

- `lib/portfolio-total.js` — aritmética pura (suma, unidades de seis decimales,
  total combinado, formato).
- `lib/portfolio-summary.js` — tarjeta, estilos y lectura de datos.
- `assets-wallet-ui.js` — monta y libera la tarjeta junto al resto de Activos.
- `tests/portfolio-total.test.mjs`, `tests/portfolio-summary.test.mjs`.

## Verificación

- `node --test tests/portfolio-total.test.mjs tests/portfolio-summary.test.mjs`:
  7 pasadas, 0 fallos.
- Suites relacionadas (wallet/finance/terminal): 30 archivos, 109 pasadas,
  0 fallos, 2 omitidas.
- `npm run build:web`: 33 assets generados; la tarjeta aparece en el bundle
  `www/assets-wallet-ui.js`.
- No se verificó visualmente en navegador en esta sesión: `node_modules` se
  instaló solo para compilar y no hay navegador automatizado configurado.
  Falta la comprobación visual del usuario.

## Discover

Revisado `discover.html`, `discover.js`, `discover.css` y `discover-tour.css`:
no se cambió el texto público. La copia actual ya describe Activos como el
lugar para recibir, revisar swaps y enviar tokens; el total consolidado es una
comodidad dentro de la app y no añade una promesa de producto nueva. Si el
usuario quiere anunciarlo, hay que actualizar los catálogos de idioma de
`discover.js` (es/en y el resto) en el mismo release.

## Pendiente

- Revisión visual en escritorio y móvil.
- Decidir si se anuncia en Discover.
- Commit y versión: otro árbol de trabajo ya subió `package.json` a 1.38.27;
  este cambio no toca la versión.
