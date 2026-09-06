# Ensayo Jamd en Devnet

El propietario confirmó Jamd / JAMD y 1.000 millones de tokens sin valor en Devnet.
La configuración se guarda en security/jamd-devnet-draft.json; no es un manifiesto
de emisión ni un formato de importación del laboratorio.
Se confirmaron 9 decimales y la wallet pública de ensayo. No contiene claves privadas.

## Comprobación efectuada

El programa de protección `BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V`
está desplegado y es ejecutable en Devnet. El mint de referencia es
`3hGv2JJ8Hfktw5LMPoSN6R4enoAAZMPvPtS3TcwgGV61`; tiene suministro fijo,
metadatos sellados, autoridad de emisión revocada y congelación desactivada.
La política y el depósito del creador están registrados en el archivo de estado.
La recarga de prueba 10 JAMD por 20 créditos fue ejecutada y acreditada sin reutilizar firmas.

## Próximo ensayo necesario

Crear un nuevo ensayo que aplique la distribución aprobada a cuentas separadas,
verifique 870 millones bloqueados, use 24 meses naturales y 36 liberaciones mensuales,
y pruebe intentos de desbloqueo prematuro, sustitución de beneficiarios, doble acreditación,
elegibilidad duplicada y pérdida temporal de RPC. Registrar el commit y hashes verificables.

El mint actual sigue siendo una referencia de Devnet, no el token definitivo de Mainnet.
No retirar protecciones para acelerar la salida. Auditoría y revisión legal siguen pendientes.
