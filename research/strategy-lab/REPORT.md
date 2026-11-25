# Estrategia de futuros cripto: evidencia, simulación y límites

**Fecha:** 2026-11-17  
**Alcance:** investigación y simulación local. No se modificó la web, el bot, el executor ni ningún sistema de producción.  
**Pregunta:** ¿cuál es la estrategia de trading de futuros cripto mejor respaldada por evidencia verificable?

## Conclusión ejecutiva

No existe evidencia sólida de una estrategia direccional que acierte "todas" las operaciones ni que alcance todos los TP. Los estudios recientes que corrigen errores de backtest encuentran que las estrategias complejas de machine learning y los factores de tendencia sofisticados **no sobreviven a costes realistas**. La ventaja más robusta que aparece en la literatura es el **time-series momentum (TSMOM) simple con control de volatilidad**, y el **carry de funding/basis delta-neutral** como prima de riesgo separada, no como estrategia direccional.

Para un bot de futuros, la combinación mejor defendible es:

1. **Núcleo (mayoría del capital): carry delta-neutral de funding/basis**, solo cuando la tasa anualizada es alta y con colateral amplio.
2. **Satélite direccional (minoría): TSMOM 10 días con filtro de momento 1%, volatilidad objetivo 10%, rebalanceo 30 días y máximo 2x de exposición efectiva**; sin prometer TP en cada trade.

Si se obliga a elegir **una sola** estrategia direccional, la mejor respaldada por esta iteración es **TSMOM 10d con filtro 1% y volatility targeting al 10%**, no un cruce de medias ni un sistema de ML. Aun así, su ventaja neta en cripto es frágil y dependiente del régimen.

**Nivel de confianza:** medio en la conclusión cualitativa; bajo en cualquier cifra de rentabilidad futura.

## Evidencia revisada

| Fuente | Tipo | Fecha | Qué aporta | Confianza |
|---|---|---|---|---|
| [BIS Working Paper 1087, "Crypto carry"](https://www.bis.org/publ/work1087.htm) | Investigación de banco central (working paper) | 4 abr 2023 | El carry de futuros cripto promedia >10% anual y puede llegar a 60%; lo explica la conveniencia/atención y la escasez de capital de arbitraje. Alto carry predice crashes; el cash-and-carry es riesgoso por márgenes y liquidaciones. | Alta (descriptiva) |
| [Liu, Tsyvinski y Wu, "Common Risk Factors in Cryptocurrency"](https://onlinelibrary.wiley.com/doi/abs/10.1111/jofi.13119) | Estudio peer-reviewed, Journal of Finance | 2022 | Factores de mercado, tamaño y momentum explican retornos cripto; el momentum es un factor relevante. | Alta |
| [Liu y Tsyvinski, "Risks and Returns of Cryptocurrency"](https://www.nber.org/papers/w24877) | NBER working paper / RFS | 2018 / 2021 | Los retornos cripto tienen predictibilidad por momentum; los inversores exigen prima por riesgo. | Alta |
| [Moskowitz, Ooi y Pedersen, "Time Series Momentum"](https://doi.org/10.1016/j.jfineco.2011.11.003) | Peer-reviewed, Journal of Financial Economics | 2012 | Base académica del TSMOM: persistencia de retornos propios del activo y diversificación entre futuros. | Alta |
| [Hurst, Ooi y Pedersen, "A Century of Evidence on Trend-Following Investing"](https://research.cbs.dk/en/publications/a-century-of-evidence-on-trend-following-investing-executive-summ/) | White paper de industria (AQR) | 2012 | Tendencia positiva y baja correlación con activos tradicionales durante más de un siglo. Posible conflicto de interés. | Media |
| [Flores Campins, "Does Algorithmic Directional Trading in Cryptocurrencies Survive Transaction Costs?"](https://zenodo.org/records/23174953) | Preprint, Zenodo | 6 oct 2026 | 60 configuraciones, 45 direccionales, datos Binance, coste round-trip 0,20%, walk-forward con purga. AUC direccional ~0,53; ningún sistema complejo supera criterios institucionales. Una regla canónica de momentum logra Calmar 1,101, pero no pasa los criterios preinscritos. | Media-baja (preprint no revisado) |
| [Wang y Pang, "The Cryptocurrency Trend Factor Revisited"](https://arxiv.org/abs/2611.01951) | Preprint, arXiv | 1 nov 2026 | Al corregir el uso de información futura y la contabilidad, el factor CTREND pasa de Sharpe 2,08 a 1,48 y luego a 0,01; el alpha neto se vuelve negativo. | Media (preprint con auditoría de código) |
| [Kumar y Jenefer, "Time-Series Momentum in Cryptocurrency Markets"](https://zenodo.org/records/19671502) | Artículo corto, Zenodo | 21 abr 2026 | TSMOM volatility-scaled, rebalanceo mensual: Sharpe 0,82 pre-ETF y 1,22 post-ETF; diferencia no significativa (p=0,58). Muestra limitada. | Baja |
| [Kasinski, "Digital Asset Funding Rates as a Distinct Risk Factor"](https://data.mendeley.com/datasets/8wf3t29jbd) | Dataset/estudio no peer-reviewed | oct 2025 | Carry delta-neutral: 10,56% anualizado, 1,50% volatilidad, baja correlación (ago 2020-ago 2025). Cifras no auditadas y con posible sesgo de proveedor. | Baja |
| [Pindza, "Centralized–decentralized exchange funding rate arbitrage as a basis trade"](https://link.springer.com/article/10.1007/s42521-026-00213-3) | Artículo peer-reviewed, Digital Finance | 2026 | Descomposición de riesgo, stress testing y construcción de portafolio para arbitraje de funding entre CEX/DEX; la incertidumbre de venue es un riesgo central. | Media (detalle no accesible) |

### Lo que no pude verificar

- No tuve acceso al texto completo de varios papers de pago; sus conclusiones se citan desde el abstract o la página del editor.
- Los historiales de funding públicos tienen ventanas limitadas: Bitget devolvió ~270 registros de 8 h (ago-nov 2026); OKX, 100 registros por página y la paginación pública no permitió reconstruir 2020-2026 de forma fiable en esta sesión.
- No hay un historial auditado de un trader de futuros cripto con suficiente tamaño y fuera de muestra; los "track records" de redes sociales no son evidencia verificable.
- No se probó con datos tick-by-tick ni con libros de órdenes; el slippage se modela como coste fijo.

## Simulación local

### Metodología

- Precios diarios de Yahoo Finance para BTC-USD, ETH-USD y SOL-USD, 2019-01-01 a 2026-11-17.
- Estrategias: compra pasiva; TSMOM 30d; TSMOM 60d; cruce MA 50/200; Donchian 55/20 con máximos/mínimos reales; TSMOM + filtro MA200.
- Volatility targeting: 22% anual; máximo 3x de exposición efectiva; rebalanceo semanal.
- Costes base: 5 pb por lado; funding: 2 pb/día sobre exposición absoluta. Escenario de estrés: 10 pb por lado y 5 pb/día.
- Split: in-sample 2019-2022; out-of-sample 2023-2026.

### Resultados de cartera equal-weight BTC/ETH/SOL

| Estrategia | CAGR full | Vol | Sharpe | Max DD | Calmar | OOS CAGR | OOS Sharpe | OOS DD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Compra pasiva | 20,36% | 24,53% | 0,88 | -44,36% | 0,46 | 17,51% | 0,76 | -38,86% |
| **TSMOM 30d** | **24,07%** | 19,97% | **1,18** | **-26,41%** | **0,91** | 10,19% | 0,56 | -26,41% |
| TSMOM 60d | 8,13% | 21,01% | 0,48 | -52,32% | 0,16 | -0,17% | 0,10 | -36,04% |
| MA 50/200 | -1,81% | 22,72% | 0,03 | -63,38% | -0,03 | -22,33% | -0,95 | -62,98% |
| Donchian 55/20 | 11,57% | 15,97% | 0,77 | -35,26% | 0,33 | 3,82% | 0,31 | -23,40% |
| TSMOM + MA200 | 15,43% | 16,75% | 0,94 | -27,85% | 0,55 | 0,13% | 0,09 | -27,85% |

### Estrés de costes (TSMOM 30d)

| Activo | Sharpe full (5 pb) | Sharpe OOS (5 pb) | Sharpe full (10 pb + 5 pb funding) | Sharpe OOS (estrés) |
|---|---:|---:|---:|---:|
| BTC | 0,80 | 0,60 | 0,59 | 0,34 |
| ETH | 1,15 | 0,93 | 0,99 | 0,74 |
| SOL | 0,58 | -0,32 | 0,45 | -0,48 |

La ventaja se concentra en ETH; en SOL desaparece con costes altos. La compra pasiva fue competitiva en BTC y en la cartera OOS. Esto impide afirmar que TSMOM sea universalmente superior.

### Carry de funding (muestra corta)

Bitget, 270 observaciones de 8 h por activo (19 ago-17 nov 2026), short perpetuo delta-neutral:

| Activo | Funding medio 8 h | Anualizado | Vol anualizada | Max DD del funding |
|---|---:|---:|---:|---:|
| BTC | 0,0060% | 6,57% | 0,13% | -0,01% |
| ETH | 0,0058% | 6,35% | 0,14% | -0,03% |
| SOL | 0,0038% | 4,16% | 0,21% | -0,12% |

El Sharpe calculado es artificialmente alto por la muestra corta y porque no incluye basis, comisiones, slippage, descalce spot-perp, riesgo de venue ni liquidaciones. **No usar estas cifras como expectativa.**

## Estrategia recomendada (si se implementa)

### Núcleo: carry delta-neutral condicionado

- Universo: BTC, ETH; SOL solo con límites más estrictos.
- Entrada: funding anualizado >10% (o basis >8%) y positivo; verificar liquidez y salud del venue.
- Posición: long spot + short perpetuo, delta-neutral; 1x, sin apalancamiento adicional.
- Colateral: buffer ≥40-50% en el perpetuo para soportar spikes de margen.
- Salida: funding anualizado <3%, o antes si el venue muestra estrés.
- Límites: máximo 30% del capital por venue; máximo 50% del capital total en carry; reserva estable para márgenes.

### Satélite: TSMOM con volatility targeting

- Universo: BTC, ETH y SOL; cartera equal-weight. SOL es el más débil (validación Sharpe 0,12 y DD -33,94%); si se quiere conservador, operar solo BTC/ETH hasta validar SOL.
- Señal: retorno de 10 días; largo si >+1%, corto si <-1%; si queda dentro de la banda, fuera.
- Tamaño: volatilidad objetivo 10% anual; exposición efectiva máxima 2x (no 10x); el apalancamiento real suele quedar por debajo de 1x.
- Rebalanceo: cada 30 días; ejecución con órdenes límite, no market agresivo.
- Salida: señal contraria o fin de banda; sin TP fijo "mágico". El TP1/TP2/TP3 puede usarse para toma parcial, pero no esperar que todos lleguen.
- Filtro de drawdown opcional: si la cartera cae >8%, reducir a 50% hasta recuperar la mitad del drawdown; en esta versión no fue necesario para el DD histórico, pero reduce la cola.
- Riesgo por operación: 0,5-1% del equity; pérdida diaria máxima 2-3%; pausa tras 3 stops.

### Por qué esta combinación

- El carry tiene la prima documentada más grande y estable (BIS), pero es vulnerable a liquidaciones, spikes de margen y riesgo de exchange; por eso va con colateral y caps.
- TSMOM tiene soporte académico y siglos de evidencia en futuros, pero en cripto su ventaja neta es irregular; por eso va como satélite y con volatility targeting, no como máquina de aciertos.
- Las medias móviles clásicas, Donchian y ML complejo no mostraron una ventaja robusta después de costes en esta simulación y en la literatura reciente.

## Fase 2: walk-forward y datos adicionales

Se eligió el lookback de TSMOM (10, 20, 30, 40, 60, 90 o 120 días) usando solo los dos años anteriores y se probó el año siguiente. No hay reoptimización con el futuro.

| Año | BTC lookback / test Sharpe | ETH lookback / test Sharpe | SOL lookback / test Sharpe |
|---|---:|---:|---:|
| 2022 | 30 / 0,04 | 30 / 0,77 | 60 / 0,45 |
| 2023 | 30 / 2,41 | 120 / -0,43 | 120 / 1,39 |
| 2024 | 30 / -0,22 | 30 / 0,25 | 120 / 0,32 |
| 2025 | 40 / -0,10 | 40 / 0,07 | 20 / 0,44 |
| 2026 | 90 / -2,33 | 30 / 1,39 | 20 / 0,92 |

El parámetro ganador cambia con frecuencia y BTC acumula años negativos, incluido un -51,5% en 2026. El buen resultado de SOL/ETH no compensa la falta de estabilidad. Esto refuerza que TSMOM no es una máquina de aciertos y que debe diversificarse y limitarse.

Datos adicionales disponibles en esta sesión:

- OI de OKX: 180 días diarios (no años).
- Funding de OKX: 200 registros de 8 h (~66 días) por activo; Bitget: 270 registros (~90 días).
- No hay historial gratuito fiable de liquidaciones por exchange.
- No hay datos tick/order book históricos; el slippage sigue siendo un supuesto.

Por eso no se puede cumplir el criterio de ≥2 años de funding/OI ni modelar liquidaciones con datos reales. La validación honesta máxima es **paper trading** con las reglas y los costes medidos en vivo.

## Fase 3: iteración (candidato intermedio, superado en Fase 4)

Se probaron 192 combinaciones de lookback (20/30/40/60), volatilidad objetivo (15/20/25%), apalancamiento máximo (1/1,5/2/3) y rebalanceo (1/7/14/30), eligiendo con 2019-2022 y validando 2023-2026.

El mejor candidato intermedio fue:

```
lookback 20d · volatilidad objetivo 15% · max leverage 2x · rebalanceo 14d · filtro 0,5%
```

| Cartera | CAGR | Vol | Sharpe | Max DD | Calmar |
|---|---:|---:|---:|---:|---:|
| Full 2019-2026 | 14,93% | 14,01% | 1,06 | -20,07% | 0,74 |
| Train 2019-2022 | 13,87% | 13,73% | 1,02 | -16,95% | 0,82 |
| Validación 2023-2026 | **15,68%** | 14,21% | **1,10** | **-17,18%** | **0,91** |

Por activo en validación: BTC Sharpe 1,08, ETH 0,60, SOL 0,83. Los tres positivos, aunque ETH sigue siendo el más débil. Años: 2022 -9,67%, 2024 +0,65%, 2026 +2,78%; no elimina los años malos.

Estrés de costes:

| Escenario | Sharpe validación | CAGR validación | DD validación |
|---|---:|---:|---:|
| Base (5 pb/lado, 2 pb/día funding) | 1,10 | 15,68% | -17,18% |
| Doble (10 pb/lado, 4 pb/día) | 0,92 | 12,78% | -18,16% |
| Alto (10 pb/lado, 5 pb/día) | 0,84 | 11,58% | -18,55% |

Bootstrap de bloques de 30 días, 3.000 remuestras:

- Sharpe mediano 0,97; percentil 5 = **0,27**; percentil 95 = 1,68.
- Probabilidad de Sharpe positivo: 99,4%.
- Drawdown percentil 5 = **-34,35%**, peor que el -20% histórico.

Es decir: la estrategia tiene expectancy positiva en la muestra, pero un camino malo puede producir un drawdown de un tercio. No es apta para apalancamiento alto ni para capital que no tolere esa pérdida.

El risk parity (inverse-vol) apenas mejoró: Sharpe validación 1,12 vs 1,10 y CAGR 16,39% vs 15,68%; no justifica la complejidad. El freno de drawdown del 8% bajó el DD full a -14,7%, pero redujo la validación a Sharpe 1,01 y CAGR 9,25%; queda como opción conservadora, no como base.

### Snapshot paper (17 nov 2026, sin órdenes)

| Activo | Cierre | Ret 10d | Vol 20d | Señal | Exposición efectiva |
|---|---:|---:|---:|---:|---:|
| BTC | 64.634,63 | -14,67% | 45,03% | Corto | -0,22x |
| ETH | 1.817,19 | -18,70% | 62,67% | Corto | -0,16x |
| SOL | 71,73 | -20,35% | 66,68% | Corto | -0,15x |

La volatilidad está muy alta; por eso el volatility targeting reduce la exposición a ~0,15-0,22x. El replay de los últimos 365 días de la versión final dio +7,95%, Sharpe 1,27 y DD -4,02%. No enviar órdenes reales con esto: es una simulación, no una garantía.

## Fase 4: versión final tras replay de 365 días

El replay de 365 días del candidato anterior (20d/15%/14d) fue débil: +1,33%, Sharpe 0,16 y DD -17,2%. Eso obligó a revisar el enfoque, no a defenderlo.

Se probó un vecindario de parámetros y un walk-forward que elige parámetros con el pasado. La versión final es:

```
TSMOM 10d · filtro 1% · volatilidad objetivo 10% · rebalanceo 30d · max 2x
```

| Cartera | CAGR | Vol | Sharpe | Max DD | Calmar |
|---|---:|---:|---:|---:|---:|
| Full 2019-2026 | 11,81% | 8,05% | 1,43 | -7,84% | 1,51 |
| Validación 2023-2026 | 10,98% | 8,57% | 1,26 | -7,25% | 1,51 |
| Últimos 365 días | 7,95% | 6,17% | 1,27 | -4,02% | — |
| Estrés alto (10 pb/lado, 5 pb/día) | 9,82% | 8,05% | 1,01 | -8,43% | 1,16 |

Años: 2020 +27,08%, 2021 +8,56%, 2022 +8,03%, 2023 +20,36%, 2024 +9,46%, 2025 +4,63%, 2026 +10,15%. **Todos positivos**, algo que no lograban las versiones anteriores.

Por activo en validación: BTC Sharpe 1,36, ETH 1,06, SOL 0,12. SOL sigue siendo el eslabón débil; la cartera funciona por BTC/ETH.

Walk-forward con selección de parámetros: Sharpe agregado 1,17, CAGR 10,64%, DD -9,21%; seleccionó volatilidad 10% y lookbacks 10-12, lo que respalda la zona elegida.

Bootstrap (3.000 remuestras, bloques de 30 días): Sharpe mediano 1,31; percentil 5 = **0,69**; DD percentil 5 = **-14,73%**; probabilidad de Sharpe positivo 99,7%.

## Riesgos y límites

1. **Liquidación:** con 10x, un movimiento adverso de ~10% puede liquidar; el carry delta-neutral también puede sufrir si el margen del perpetuo se dispara. Usar 1x-2x, nunca 10x.
2. **Funding adverso:** el funding puede volverse negativo; el carry deja de pagar y puede perder.
3. **Basis y convergencia:** el precio del perpetuo puede divergir; el hedge no es perfecto.
4. **Riesgo de venue:** quiebras, retiros congelados, hackeos, cambios de reglas; diversificar y limitar exposición.
5. **Slippage y comisiones:** pueden eliminar la ventaja de estrategias de alta frecuencia; usar límites y medir costes reales.
6. **Sobreajuste:** los parámetros finales 10d/1%/10%/30d salieron de varias rondas de búsqueda; la validación no es un holdout virgen. El walk-forward y el bootstrap ayudan, pero el Sharpe observado sigue inflado por multiple testing. El percentil 5 de Sharpe es 0,69 y el de DD -14,73%.
7. **Datos:** Yahoo es precio spot, no perpetuos; el funding es corto; no se modelan liquidaciones ni microstructure.
8. **Régimen:** en mercados laterales el trend following pierde; en crashes el carry puede sufrir ambas patas.

## Cómo validarla antes de capital real

1. Paper trading durante 8-12 semanas con estas reglas y costes reales.
2. Walk-forward: calibrar solo con datos antiguos, probar en bloques futuros; no reoptimizar con el resultado.
3. Deflated Sharpe / corrección por todas las pruebas realizadas; aceptar que el Sharpe observado está inflado.
4. Estrés de costes al doble y de funding al doble; usar el escenario alto como base de decisión.
5. Comparar contra compra pasiva y contra no operar; si no supera, no desplegar.
6. Revisar cada trade: slippage real, funding pagado, desviación de entrada y causa de salida.
7. Si el drawdown supera 20%, detener y revisar; no aumentar apalancamiento para recuperar.

## Veredicto honesto

La estrategia "más acertada" no es la que más TP toca, sino la que tiene **expectativa positiva después de costes y sobrevive a distintos regímenes**. Con la evidencia disponible, esa es una combinación de **carry delta-neutral + TSMOM con volatility targeting y riesgo bajo**, no un sistema de alta frecuencia ni un indicador mágico. Ninguna configuración permite prometer que todos los trades lleguen a TP.
