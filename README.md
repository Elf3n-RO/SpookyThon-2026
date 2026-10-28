# Plaga Z · Comité de Contención de Manta

Simula un brote inspirado en el dengue sobre una red de hogares, colegios, mercados y buses de Manta. Cada día llega un presupuesto corto. La herramienta dice a quién vacunar, a quién aislar, qué barrio fumigar y qué lugar cerrar, y mide cuánta gente se evita contagiar frente a no hacer nada y frente a gastar el mismo dinero al azar.

La interfaz presenta el reto con estética pixel-art de apocalipsis zombie; el producto sigue siendo una herramienta de simulación y decisión, no un videojuego de acción.

La misma semilla y la misma configuración dan el mismo resultado. El motor corre en el navegador, así que el brote sorpresa no depende de un servidor. La arquitectura prevista para AWS sirve el sitio con CloudFront; la misma simulación también podría correr en Lambda.

Región: **us-east-1**.

**Estado del despliegue:** la aplicación se valida localmente, pero todavía no está desplegada en AWS. La URL pública, la captura del Budget y el gasto real quedan pendientes de la cuenta del equipo.

## Resultado de la configuración base

Semilla `20261030`. 20 corridas. 1.600 personas. 72 días. Foco de 4 infecciosos en un hogar de Eloy Alfaro. 280 USD al día. Vacuna al 65 %.

| Política | Contagios medios | Rango p10–p90 | Pico de enfermos | Muertes del escenario | USD gastados |
| --- | ---: | ---: | ---: | ---: | ---: |
| No intervenir | 816 | 568–1065 | 139 | 5,1 | 0 |
| Al azar | 374 | 213–569 | 66 | 1,0 | 20.152 |
| Comité | 24 | 10–42 | 5 | 0 | 11.735 |

El Comité gana las **20 de 20** corridas contra las dos líneas. Evita en promedio **792** contagios frente a no hacer nada (entre 543 y 1.030) y **350** frente al azar (entre 201 y 537). El presupuesto disponible en 72 días es 20.160 USD. Esos promedios salen de `npm run snapshot` con el código de este repositorio.

Si la misma tasa se pasara al cantón (271.145 habitantes, INEC 2022) sería una regla de tres, no un censo. El informe de la app la muestra con esa advertencia.

## Cómo probarlo

Hace falta Node 20 o más nuevo.

```bash
npm test
npm start
```

Abrir http://localhost:8787 . La base arranca sola. Para repetir el número de arriba no cambien nada: semilla `20261030`, 20 corridas.

También se puede pedir por API, en local o en la Lambda:

```bash
curl -s -X POST http://localhost:8787/api/simular -H "content-type: application/json" -d "{\"seed\":20261030,\"runs\":8}"
```

El API del servidor recorta a 30 corridas. La Lambda, a 24. El navegador acepta hasta 80.

Brote sorpresa, sin tocar código: **Doble contagio**, **Mitad de presupuesto**, **Empieza en el mercado**, **Vacuna a medias**. Cada botón cambia el parámetro y vuelve a simular.

El mapa usa teselas públicas de [OpenStreetMap](https://www.openstreetmap.org/copyright), cargadas directamente desde `tile.openstreetmap.org` (sin clave API). Se puede acercar, alejar, arrastrar y seleccionar un barrio para centrarlo. Se revisaron las coordenadas de Barbasquillo, Eloy Alfaro, Jocay, Los Esteros y Santa Marianita contra referencias cartográficas de OpenStreetMap; algunas ubicaciones restantes son aproximadas. Los puntos representan resultados de la población sintética, no pacientes ni reportes actuales, y no son geodatos oficiales. Se necesita conexión a internet para el mapa base; si las teselas no cargan, la interfaz lo indica y conserva los puntos simulados.

## Cómo desplegarlo

Amplify Hosting espera la carpeta `dist`. El `amplify.yml` de la raíz ejecuta `npm run build`, que copia `public/` a `dist/`; confirma que la consola de Amplify use esta especificación de compilación.

1. Cuenta de AWS del equipo. `aws configure`.
2. [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).
3. Desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -Email equipo@correo.com
```

Eso empaqueta el sitio, crea la pila `plaga-z` en **us-east-1**, sube `dist/` al bucket privado, invalida CloudFront y, si pasaron correo, crea el presupuesto de 10 USD con alerta al 50 % real y al 80 % previsto.

4. La URL queda en la salida `SiteUrl`. Anótenla aquí antes de entregar:

**URL pública:** _pegar después del deploy_

5. Confirmen el correo de la alerta. Guarden la captura de la consola (Billing → Budgets, con la alerta visible) como `docs/budget.png`.

![Alerta del presupuesto AWS](docs/budget.png)

Esa imagen tiene que ser la captura real. No está en el repositorio a propósito: una captura inventada no sirve para la rúbrica.

## Arquitectura AWS prevista

El dibujo está en [docs/arquitectura.svg](docs/arquitectura.svg). La fuente, en [docs/arquitectura.md](docs/arquitectura.md).

- **Público tras el despliegue:** CloudFront (HTTPS). El navegador descarga el sitio y ejecuta el motor. No se suben casos reales.
- **Privado tras el despliegue:** bucket S3 con acceso público bloqueado. Solo CloudFront entra, por Origin Access Control. Cifrado SSE-S3.
- **Opcional:** Lambda `plaga-z-simular` con URL de función pública. Misma simulación, máximo 2 ejecuciones simultáneas, 28 segundos y 512 MB. No se envían datos personales. El demo principal no depende de esta API. El rol básico que crea SAM permite escribir sus logs en CloudWatch.
- **Despliegue:** AWS SAM CLI procesa `infra/template.yaml` y crea una pila de AWS CloudFormation para CloudFront, S3 y Lambda.
- **Pendiente de configurar en la cuenta:** AWS Budget de 10 USD al mes con alertas por correo al 50 % real y al 80 % previsto. CloudWatch Logs se usa solo si se invoca Lambda.
- **Mapa:** teselas públicas de OpenStreetMap desde el navegador. Es un servicio externo, no un servicio de AWS; se muestra la atribución requerida.

AWS Budgets no forma parte de la plantilla CloudFormation: `scripts/deploy.ps1` lo solicita por separado cuando se ejecuta con `-Email`. La arquitectura anterior está definida en el código, pero todavía no está desplegada en una cuenta.

El demo de los 5 minutos usa el navegador. Así no hay arranque en frío ni una factura si el jurado mueve los parámetros muchas veces.

## Decisiones de diseño

El dengue no salta de persona a persona por el aire. En el modelo, pica en la casa, en el lugar donde la persona pasa el día, en el bus y, con retraso, el mosquito del barrio. Cerrar un colegio manda a la gente a la casa: a veces empeora. El Comité solo cierra si la cuenta da positiva.

El foco empieza con 4 infecciosos ya visibles. Un solo caso se apaga demasiado fácil y el azar, aislándolo, empata. Cuatro casos es el momento en que la vigilancia ya se dio cuenta.

El aislamiento no es mágico. Entra al día siguiente de aparecer el caso (el foco inicial ya viene en el parte) y deja un 40 % de presencia en el mercado, el colegio o el bus. En el domicilio no reduce nada.

La vacuna solo se pone a sanos. Eficacia 65 % en la base, y el escenario la puede bajar. Con eficacia 0 el Comité no compra dosis: el test lo exige.

La comparación es pareada. Cada corrida usa una semilla hija de la semilla maestra (`childSeed` en `public/engine/index.js`). Las tres políticas ven la misma ciudad. Cada contagio tira su propio dado (`unit(semilla, día, persona, sal)`), así que vacunar a una persona no reordena la suerte de las demás.

El Comité es voraz: cada mañana ordena las acciones legales por contagios evitados por dólar. Si la mejor no cabe hoy, reserva el dinero. No predice el dado.

Los estados de la interfaz usan los nombres del reto. Zombie = infeccioso. Exorcizado = inmune a este serotipo.

## Supuestos y de dónde salen los números

Todo lo ajustable vive en `public/engine/params.js`. Esto es lo que no hay que memorizar de otra parte.

| Dato | Valor en el escenario | De dónde sale |
| --- | --- | --- |
| Población del cantón Manta | 271.145 | Censo INEC 2022, vía [citypopulation](https://citypopulation.de/en/ecuador/admin/manab%C3%AD/1308__manta/) |
| Parroquia urbana Manta | 261.871 (96,6 %) | misma fuente, [parroquia Manta](https://www.citypopulation.de/en/ecuador/parish/admin/manab%C3%AD/130850__manta/) |
| Parroquias rurales | San Mateo, Santa Marianita, San Lorenzo, el 3,4 % restante | jurisdicción del cantón; el peso fino de cada una es supuesto |
| Peso de cada barrio urbano | ver `BARRIOS` en `public/engine/city.js` | reparto ilustrado. No hay censo público por barrio usado aquí |
| Por qué Eloy Alfaro es el inicio | mingas de dengue de 2025 arrancaron ahí | [El Diario, 19 mar 2025](https://www.eldiario.ec/sin-categoria/manabi-casi-800-casos-de-dengue-en-78-dias-inician-mingas-de-prevencion-19032025/): Manta iba por 105 casos y la campaña empezó en Eloy Alfaro |
| Manabí, 2024 | 10.572 casos de dengue | [El Universo](https://www.eluniverso.com/noticias/ecuador/manabi-cerro-el-2024-con-10572-casos-de-dengue-la-falta-de-agua-en-cantones-que-lleva-a-tener-el-liquido-en-tanques-va-de-la-mano-con-el-aumento-de-la-enfermedad-nota/) |
| Incubación humana | 6 días | OMS y guía MSP: 4 a 10 días. Chan y Johansson 2012: media 5,9. [PLOS ONE](https://doi.org/10.1371/journal.pone.0050972) |
| Periodo infeccioso | 5 días | orden de la viremia humana en guías de dengue (unos 4 a 7 días) |
| Retraso del mosquito | 6 días | Chan y Johansson: media del periodo extrínseco 6,5 días a 30 °C |
| Tamaño de hogar | media cerca de 3,6 | supuesto en el orden del hogar ecuatoriano. No es el promedio publicado de Manta |
| Eficacia de la vacuna | 65 %, editable | escenario. TAK-003 (Qdenga) varía por serotipo; no es la ficha del fabricante |
| Camas | 1,4 por 1.000 habitantes | orden de magnitud histórico de Ecuador en indicadores internacionales. No es el inventario de un hospital de Manta |
| Graves que ocupan cama | 13 % de los infecciosos de ese día | proporción de dengue con signos de alarma entre casos notificados de Ecuador en 2023 (MSP, 13,06 %). Es un supuesto fuerte: aquí se aplica a los infecciosos del modelo |
| Muerte base | 0,1 % al salir de infeccioso | orden de los reportes nacionales de letalidad baja. Sube si las camas se pasan, con techo de 1,2 % en el escenario. No es una tasa clínica medida en Manta |
| Costos | vacuna 28, aislamiento 18, fumigación 240, cierre de colegio 90/día, mercado 150/día, Mercado Central 220/día | supuestos de planificación para que el presupuesto apriete. No son tarifas del MSP |
| Betas de contagio | `BETAS` en `params.js` | calibración interna. Sin intervención, en la base, el ataque a 72 días queda cerca de la mitad de la ciudad simulada (816/1600). La descendencia directa media del foco es 8,9 personas. No es un ajuste estadístico a los 105 casos |
| Índice de mosquito por barrio | más alto en Eloy Alfaro, Primero de Mayo y Los Esteros | supuesto de criaderos y almacenamiento de agua, motivado por las notas de prensa. No es un índice aédico oficial |

Lo que el modelo no afirma: no predice la temporada 2026, no dice cuántas dosis debe comprar el municipio y no reemplaza la vigilancia del MSP.

## Limitaciones

- La población es sintética. Conserva la proporción urbana del censo y nombres de barrios reales. No usa microdatos.
- Un solo serotipo. Quien se recupera no se reinfecta en estos 72 días.
- El mosquito no es una población aparte con nacimiento y muerte. Es una presión por barrio, con retraso.
- El cierre y la fumigación duran un bloque fijo. La fumigación baja la presión a la mitad durante 6 días: un promedio del efecto corto que la propia OMS trata como medida de apoyo, no como solución única.
- La muerte por saturación es un escenario para que el pico importe. No reproduzcan esa cifra como letalidad de Manta.
- Pasar la tasa al cantón completo es una regla de tres. Sirve para comparar políticas.
- En alguna semilla suelta las dos intervenciones pueden dejar el brote en los 4 casos iniciales. Ahí empatan, porque no hay a quién más salvar. En la semilla documentada el Comité gana las 20.

## Mapa del código

| Archivo | Qué explicar en la defensa |
| --- | --- |
| `public/engine/params.js` | Todos los números y sus topes |
| `public/engine/city.js` | Cómo se arma Manta |
| `public/engine/epi.js` | La fuerza de infección de un día |
| `public/engine/plan.js` | La regla del Comité y la del azar |
| `public/engine/simulate.js` | El día: decidir, contagiar, avanzar la enfermedad |
| `public/engine/rng.js` | Por qué la semilla alcanza para repetir el resultado |
| `public/app.js` | La interfaz |
| `docs/defensa.md` | Respuestas cortas al jurado |

## Costos

La cuenta detallada está en [docs/costos.md](docs/costos.md).

Operar el sistema un mes, a precio de lista y con poco tráfico, se estima en **0,13 USD**. Con el free tier de una cuenta nueva, la factura estimada para ese escenario es **0,00 USD**. El Budget de 10 USD es el tope previsto y aún no está creado; el gasto real del proyecto se podrá informar después de desplegarlo y consultar Billing.

## Presentación

Las diapositivas están en [docs/pitch.html](docs/pitch.html). Ábranlas en el navegador e impriman en horizontal a PDF para entregarlas. El archivo no puede pasar de 20 MB.
