# Costos

Región de los precios: **us-east-1**. Precios de lista públicos de AWS, sin contar el free tier. El free tier se anota aparte porque una cuenta nueva del evento probablemente todavía lo tenga.

## Qué se paga

| Pieza | Precio de lista usado | Fuente del orden de magnitud |
| --- | --- | --- |
| CloudFront, salida a internet | 0,085 USD por GB en los primeros 10 TB | [Precios de CloudFront](https://aws.amazon.com/cloudfront/pricing/) |
| CloudFront, solicitudes HTTPS | 0,010 USD por 10.000 | misma página |
| S3 Standard, almacenamiento | 0,023 USD por GB al mes | [Precios de S3](https://aws.amazon.com/s3/pricing/) |
| S3 GET | 0,0004 USD por 1.000 | misma página |
| Lambda, cómputo | 0,0000166667 USD por GB-segundo | [Precios de Lambda](https://aws.amazon.com/lambda/pricing/) |
| Lambda, invocaciones | 0,20 USD por millón | misma página |
| URL de función | 0 USD | no usa API Gateway |
| AWS Budgets | 0 USD para los dos primeros presupuestos | [Precios de Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) |
| CloudWatch Logs | 0,50 USD por GB ingerido, irrelevante a este volumen | consola de precios |

No hay base de datos, NAT gateway, balanceador ni instancias encendidas.

## Cuenta del mes de operación

Escenario: el sitio sigue publicado un mes después del pitch, con poco tráfico de jurado y ensayo.

- Sitio: unos 2 MB. Diez visitas completas con recarga ≈ 20 MB. Redondeo a **1 GB** de salida para tener margen. `1 × 0,085 = 0,085 USD`.
- Solicitudes: **20.000**. `2 × 0,010 = 0,020 USD`.
- S3: 0,05 GB × 0,023 ≈ **0,001 USD**. Los GET van dentro de CloudFront; el origen casi no se llama si la caché está caliente. Dejo **0,01 USD**.
- Lambda: el demo no la necesita. Si alguien pega 100 veces al API, cada llamada de 20 corridas tarda unos 6 segundos a 512 MB, o sea 0,5 GB × 6 s = 3 GB-segundo. `100 × 3 × 0,0000166667 ≈ 0,005 USD`. Las 100 invocaciones no llegan a un centavo.
- Logs: unos pocos MB. **0,01 USD**.
- Budget: **0 USD**.

**Total de lista: 0,085 + 0,020 + 0,001 + 0,01 + 0,005 + 0,01 ≈ 0,13 USD al mes.**

Con el free tier de una cuenta nueva (1 TB de salida de CloudFront durante 12 meses, 1 millón de solicitudes Lambda al mes, 5 GB de S3) la factura esperada del evento es **0,00 USD**.

Tope de seguridad: presupuesto de **10 USD** con alerta al 50 % del gasto real y al 80 % del previsto. La función tiene como máximo 2 ejecuciones a la vez y 28 segundos, así que un abuso del URL no puede abrir una factura grande en un día.

## Gasto real durante el evento

Completar con la consola de Billing después del despliegue:

| Concepto | USD |
| --- | --- |
| Factura del mes del evento | _pendiente de la cuenta del equipo_ |
| Créditos free tier aplicados | _pendiente_ |

La captura de la alerta va en `docs/budget.png` y se enlaza desde el README. No se inventa una captura.
