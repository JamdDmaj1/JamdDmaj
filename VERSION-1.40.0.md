# 1.40.0 — 10 de noviembre de 2026

Nuevo apartado **Sniper** para analizar tokens recién creados antes de operar.

## Sniper

- Lista los pools más nuevos de Solana y los analiza automáticamente con datos públicos.
- Comprueba: autoridad de emisión revocada, autoridad de congelación revocada, porcentaje de liquidez bloqueada, concentración del top 10 de holders, liquidez real, antigüedad del pool y existencia de mercado verificable.
- Puntúa de 0 a 100 y clasifica: **ALTO RIESGO**, **MEDIO**, **PRUDENCIA** o **MEJOR PERFIL**, con el detalle de cada comprobación.
- Muestra los avisos del analizador externo y los enlaces de redes publicados por el propio token.
- Filtros por puntuación mínima, ocultar alto riesgo y búsqueda por símbolo.
- Aviso explícito: el análisis no garantiza seguridad ni rentabilidad, y la verificación de cuentas de X requiere una API de pago.

## Integración

- Botón **Sniper** en la cabecera principal y página propia.
- Sección añadida a Discover en los diez idiomas.
- Android versionCode 184, iOS 1.40.0.
