# JamdDmaj AI 1.9.0

## Cambios principales

- `Listen` ya no lee asteriscos, encabezados, bullets, enlaces Markdown ni formato raro.
- Voz más pausada y menos robótica dentro de las opciones que permite el motor de voz del teléfono.
- En `JamdDmaj Learn > Idiomas`, las respuestas muestran botones pequeños para escuchar palabras/frases específicas.
- Nuevo respaldo cifrado en la nube usando Vercel + Upstash.
- Código de recuperación privado para restaurar aunque se borre la app.
- Botón para sincronizar respaldo manualmente.
- Botón para restaurar con código.
- Versión Android `1.9.0` (`versionCode 19`).

## Importante sobre la voz

La app puede limpiar el texto y elegir mejor ritmo, pero la naturalidad final depende del motor de texto a voz instalado en Android. Para mejorar más:

1. Abre ajustes del teléfono.
2. Busca `Text-to-speech` o `Texto a voz`.
3. Instala/elige una voz de Google más natural.
4. Para japonés, instala voz japonesa.

## Respaldo automático

En la app entra a:

`Ajustes > Datos y respaldo`

Usa:

- `Ver código`: copia tu código de recuperación.
- `Sincronizar ahora`: guarda una copia cifrada.
- `Restaurar con código`: recupera todo si instalas la app de nuevo.

Guarda el código fuera de la app. Si borras la app y pierdes el código, no se puede descifrar el respaldo.

## Publicación

Sube todo el contenido de esta carpeta a GitHub. GitHub Actions generará el APK nuevo.
