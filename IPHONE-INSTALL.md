# JamdDmaj AI en iPhone

La compilacion de GitHub genera una aplicacion iOS nativa (`.ipa`), no una pagina abierta en Safari.

## Prueba privada sin publicar en App Store

1. Abre GitHub > Actions > Build Native iPhone IPA.
2. Pulsa Run workflow.
3. Descarga el artefacto `JamdDmaj-AI-iPhone-unsigned`.
4. Firma e instala el IPA con AltStore o Sideloadly usando el Apple ID del dispositivo.

Apple exige que toda app instalada en un iPhone tenga una firma valida. La compilacion sin firma no puede instalarse directamente al tocar el archivo.

## Clientes

Para entregar la app facilmente a clientes sin hacerla publica, la ruta recomendada es TestFlight. Requiere una membresia Apple Developer, certificado de distribucion y perfil de aprovisionamiento. La app sigue siendo nativa y puede mantenerse fuera de una ficha publica de App Store durante las pruebas.

