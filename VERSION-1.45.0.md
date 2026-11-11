# 1.45.0 — 10 de noviembre de 2026

Radar social: seguimiento de la cuenta de X, de los votos de la comunidad y de las menciones públicas de cada token vigilado.

## Qué se vigila

- **Cuenta de X**: seguidores, número de publicaciones, antigüedad y verificación.
- **Comunidad**: votos positivos y negativos del analizador.
- **Menciones públicas**: búsqueda de resultados que llamen scam o rug al token.

## Avisos nuevos

- Malo: la cuenta de X desaparece o es suspendida; pérdida de seguidores superior al 5 %; votos negativos acumulados; resultados públicos que lo llaman scam.
- Bueno: subida de seguidores superior al 5 %; votos positivos acumulados.
- Informativo: la cuenta publicó mensajes nuevos.

## Servicio

- Nuevo endpoint social con caché de 90 segundos que combina perfil público de X, votos y resultados de búsqueda.
- El radar consulta lo social cada 90 s y los datos de mercado cada 8 s.

## Límite

- Sin la API de pago de X no se puede leer el contenido de cada publicación ni el sentimiento de las respuestas; aquí se detectan cambios de perfil, votos y menciones indexadas públicamente.
- Android versionCode 190, iOS 1.45.0.
