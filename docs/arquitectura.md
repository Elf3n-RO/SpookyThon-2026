# Arquitectura

La imagen está en [arquitectura.svg](arquitectura.svg). Esta es la fuente.

```mermaid
flowchart LR
  persona[Persona en el navegador]
  cf[CloudFront público]
  s3[S3 privado]
  lambda[Lambda URL opcional]
  logs[CloudWatch Logs]
  budget[AWS Budget]

  persona -->|HTTPS GET| cf
  cf -->|OAC| s3
  persona -->|el motor corre en el navegador| persona
  persona -.->|POST opcional| lambda
  lambda --> logs
  budget --- cf
  budget --- lambda
```

Región: **us-east-1**.

Público: la distribución de CloudFront y, si se despliega, la URL de la función. Privado: el bucket, los logs y el presupuesto. El navegador no envía historias clínicas: solo parámetros de escenario.
