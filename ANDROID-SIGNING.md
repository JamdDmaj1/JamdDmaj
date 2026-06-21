# Firma permanente de Android

Esta configuracion permite instalar cada APK nuevo encima del anterior sin borrar los datos.

## 1. Crear la clave una sola vez

En PowerShell, dentro del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-android-signing-key.ps1
```

El script crea `.android-signing/jamddmaj-release.jks` y copia su Base64 al portapapeles.

Guarda el archivo `.jks` y la contrasena en dos lugares privados. No los subas al repositorio.

## 2. Crear GitHub Actions secrets

En GitHub: Settings > Secrets and variables > Actions > New repository secret.

Agrega:

- `ANDROID_KEYSTORE_BASE64`: pega el Base64 copiado por el script.
- `ANDROID_KEYSTORE_PASSWORD`: la contrasena creada.
- `ANDROID_KEY_ALIAS`: `jamddmaj`.
- `ANDROID_KEY_PASSWORD`: la misma contrasena.

## 3. Primera instalacion firmada

La primera vez que cambies desde el APK debug antiguo al APK release firmado, Android pedira desinstalar la version vieja.

Antes de hacerlo:

1. Abre Ajustes > Cuenta y progreso.
2. Pulsa Preparar actualizacion.
3. Guarda el JamdDmaj Sync ID.
4. Instala el APK release.
5. Restaura el progreso con el Sync ID.

Despues de esa transicion, las siguientes versiones firmadas con esta misma clave se instalan encima sin borrar datos.
