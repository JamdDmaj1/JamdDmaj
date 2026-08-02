# JamdDmaj AI v1.37.38

- Corrige respuestas repetidas y vacias del analizador de TradingView.
- Usa modelos gratuitos con capacidad visual explicita en vez de depender solo del router general.
- Exige al menos tres observaciones concretas y exclusivas de cada captura.
- Reintenta con otro modelo visual cuando la primera lectura es generica.
- La direccion dominante pasa a ser contexto secundario y no puede reemplazar el analisis del grafico.
- Elimina la presentacion accidental del JSON crudo en el resumen.
- Marca claramente un analisis incompleto y recomienda recortar la captura en vez de mostrar una falsa senal.
