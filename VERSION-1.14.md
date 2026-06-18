# JamdDmaj AI v1.14.0

## Mejoras principales

- Repara el layout del modo oculto Pro Signals en pantallas moviles para que el texto, buscador y botones no se monten.
- Mejora el buscador Pro para aceptar nombres/frases como `sui coin`, `btc futures` o `solana`.
- Agrega fallback de datos de mercado para que SUI y otras cryptos no fallen tan facil si una fuente no responde.
- Agrega recordatorios diarios de Learn con palabra/frase del idioma actual cuando el dispositivo permita notificaciones.
- Mejora las tarjetas visuales dentro de los chats de Learn para que aparezcan mas imagenes relacionadas con lo aprendido.
- Hace el backup mas automatico: se marca cada cambio importante, reintenta al volver internet, al regresar a la app y periodicamente.
- Incluye en el backup las senales Pro y la configuracion de recordatorios de Learn.

## Nota

Los recordatorios usan las notificaciones disponibles en el WebView/navegador. Para notificaciones garantizadas con la app totalmente cerrada, la siguiente mejora seria integrar notificaciones nativas programadas.
