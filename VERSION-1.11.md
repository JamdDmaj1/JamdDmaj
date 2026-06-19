# JamdDmaj AI 1.11.0

## Busqueda automatica gratis

Esta version agrega un endpoint `/api/live` para buscar informacion actual sin pedirle al usuario que abra Google manualmente.

## Que puede hacer

- Detectar preguntas con palabras como: ultimo, reciente, hoy, ahora, noticia, precio, YouTube, video, canal.
- Buscar el video mas reciente de un canal de YouTube usando fuentes publicas.
- Entregar a la IA un bloque de datos vivos verificados por la app.
- Si aparece un enlace de YouTube, el chat lo muestra con reproductor embebido.
- Mantiene precios e indicadores gratis para cripto y cotizaciones gratis cuando esten disponibles.

## Ejemplos

- "Mandame el ultimo video de MrBeast"
- "Cual es el precio actual de Nvidia"
- "Ultimas noticias de Bitcoin"
- "Busca el video mas reciente de este canal"

## Importante

El endpoint usa fuentes gratis y puede fallar si una pagina bloquea temporalmente la solicitud. Si eso pasa, la app sigue funcionando y el chat responde con la informacion que tenga disponible.
