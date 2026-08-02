# JamdDmaj AI v1.37.39

- Evita tiempos de espera 504 durante el analisis visual.
- Usa primero el modelo NVIDIA especializado en vision que produjo evidencia concreta en validacion real.
- Si hace falta otro modelo, la app lo consulta en una segunda solicitud independiente.
- Mantiene el reintento automatico sin superar el tiempo maximo de Vercel.
- Conserva el resultado incompleto original si el modelo de respaldo no responde.
