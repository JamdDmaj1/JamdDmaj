# Activar el acceso automatico de JamdDmaj AI

La version 1.7.0 permite que el chat normal funcione sin pedirle al usuario una
cuenta de OpenRouter. La clave privada queda en Vercel y nunca entra al APK.

## 1. Crear una clave privada en OpenRouter

1. Entra a `https://openrouter.ai/settings/keys`.
2. Crea una clave llamada `JamdDmaj Server`.
3. Guarda la clave en un lugar privado. OpenRouter solo la muestra completa una vez.
4. No la publiques en GitHub, no la pegues en `index.html` y no la compartas por chat.

La aplicacion fuerza `openrouter/free`. La clave personal de cada usuario sigue
siendo opcional y solo se usa para sus propios limites o para imagenes de pago.

## 2. Crear el control de limites en Upstash

1. Entra a `https://console.upstash.com/`.
2. Crea una base de datos Redis gratuita.
3. Abre la base de datos y busca la seccion REST API.
4. Guarda `UPSTASH_REDIS_REST_URL`.
5. Guarda el token Standard como `UPSTASH_REDIS_REST_TOKEN`.

No uses el token Read Only: el servidor necesita incrementar contadores.

## 3. Configurar Vercel

1. Abre el proyecto JamdDmaj en Vercel.
2. Entra a `Settings` y luego `Environment Variables`.
3. Agrega estas variables para Production, Preview y Development:

```text
OPENROUTER_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
JAMDDMAJ_OPENROUTER_MODEL=openrouter/free
JAMDDMAJ_HOURLY_LIMIT=25
JAMDDMAJ_DAILY_LIMIT=80
JAMDDMAJ_IP_HOURLY_LIMIT=100
JAMDDMAJ_IP_DAILY_LIMIT=250
JAMDDMAJ_GLOBAL_DAILY_LIMIT=1000
JAMDDMAJ_ALLOW_PAID_MODELS=false
```

4. Guarda las variables.
5. Haz un redeploy del ultimo deployment.

## 4. Comprobar

Abre:

`https://jamd-dmaj.vercel.app/api/status`

Debe responder:

```json
{"ready":true,"mode":"managed-free-chat"}
```

Si muestra `ready: false`, falta una de las tres variables privadas principales.

## 5. Publicar la aplicacion

Sube todos los archivos y carpetas de esta version a GitHub, incluyendo:

- `api/`
- `lib/`
- `.env.example`
- `.gitignore`
- `index.html`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`

Espera que Vercel publique la web. Luego espera que GitHub Actions genere el APK
1.7.0 e instala ese APK. La version 1.6.0 no contiene el acceso automatico.

## Limites iniciales

- 25 solicitudes por hora por dispositivo.
- 80 solicitudes por dia por dispositivo.
- 100 por hora por IP.
- 250 por dia por IP.
- 1000 por dia para toda la aplicacion.

Puedes cambiar estos numeros desde Vercel sin generar otro APK.
