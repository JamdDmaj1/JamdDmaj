# Objetivo: todos los tokens de Mercados operables en Futuros

Fecha: 2026-11-08. Estado: **en curso**. Nada de esto está desplegado.

## Techo real del venue (medido hoy, solo lectura)

- `Mercados` cataloga **139** tokens (`lib/markets-catalog.js`).
- Phoenix (`https://perp-api.phoenix.trade/v1/view/exchange/markets`) lista
  **107** mercados, de los cuales **55** son `assetClass: crypto`.
- Coinciden por símbolo con Mercados: **33**.

  AAVE, ADA, ARB, AVAX, BNB, BTC, CRV, DOGE, ENA, ETH, FARTCOIN, FET, FIL, HYPE,
  JTO, JUP, LINK, LTC, NEAR, ONDO, RAY, RENDER, SOL, SUI, TAO, TRX, UNI, VIRTUAL,
  WLD, XLM, XRP, ZEC, ZRO

- Los otros **106** tokens de Mercados no tienen mercado en Phoenix: no pueden
  ser futuros sin otro venue. No se deben anunciar como operables.
- Phoenix lista además 22 mercados que no están en Mercados (kPEPE, kSHIB,
  kBONK, CHIP, MON, etc.); si se quieren, hay que añadirlos a Mercados.

Conclusión de alcance: el objetivo alcanzable es **33 tokens** (3 actuales + 30
nuevos), no los 139.

## Lo que ya existe (trabajo previo de Codex, 13 commits)

- Adaptador Phoenix en `lib/phoenix-*.js` (37 módulos): catálogo, plan de orden,
  paquetes, simulación, firmas, recibos, custodia, diario durable, onboarding
  del padre, fees y recuperación.
- Cliente de navegador `lib/phoenix-manual-client.js` y servicio de servidor
  `lib/phoenix-manual-service.js`.
- Acciones ya despachadas en `lib/perps-automation-api.js`: `phoenixStatus`,
  `phoenixPositions`, `phoenixHistory`, `phoenixEntryPrepare/Confirm/Recover`,
  `phoenixClosePrepare/Confirm` y `phoenixParent*`.
- Catálogo público acotado: `lib/phoenix-public-client.js` (solo lectura, origen
  fijo `perp-api.phoenix.trade`).
- ~30 archivos de pruebas y un diseño de 43 KB (fuera del árbol actual).

## Brechas para terminar

1. **Composición del runtime** (`lib/perps-server-runtime.js`): hoy no crea
   `botPhoenix` y además falla a propósito si existe `phoenix.sqlite`
   (línea 88). Hay que componer el servicio con su diario, custodia, política y
   exclusiones entre venues, y levantar esa guarda con pruebas.
2. **Mapeo Mercados → Phoenix**: hecho en `lib/phoenix-market-map.js` con
   pruebas (esta sesión).
3. **UI de Futuros**: no hay panel que liste los mercados Phoenix, ni ticket de
   entrada/cierre; el cliente existe pero no está montado.
4. **Pruebas de composición** del runtime con Phoenix habilitado, incluyendo
   recuperación y convivencia con el diario existente.
5. **Instalación en el VPS**: binario worker + web service. Requiere ventana,
   hashes y verificación; no se hace sin autorización explícita.

## Hecho en esta sesión

- `lib/phoenix-market-map.js`: mapeo puro Mercados→Phoenix (operables,
  inactivos, no soportados, sin duplicados) y `isFuturesOperable`.
- `tests/phoenix-market-map.test.mjs`: 3 pruebas, 0 fallos.

## Siguiente paso

Componer el runtime Phoenix en un worktree aislado con su diario y sus pruebas,
sin tocar el VPS ni producción, y después montar el panel de Futuros sobre los 33
mercados operables.
