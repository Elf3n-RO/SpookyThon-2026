# Cómo explicar el proyecto

## En una frase

Simulamos un dengue en una Manta chica, repetimos el brote muchas veces con la misma suerte para tres políticas, y el Comité gasta el presupuesto donde cada dólar evita más contagios.

## Qué es cada estado

- Sano: susceptible.
- Mordido: incubando. Todavía no contagia. Dura 6 días, cerca de la media de 5,9 de Chan y Johansson (2012).
- Zombie: infeccioso. Dura 5 días, el orden de la viremia que describe la OMS.
- Exorcizado: inmune a este serotipo. No se vacuna y no se vuelve a infectar en el horizonte.
- Sin recuperar: murió en el escenario. Solo entra al final del periodo infeccioso, y sube si los graves no caben en las camas.

## Por qué no es un SIR de pizarra

La gente no se mezcla con toda la ciudad. Cada persona tiene hogar, un lugar de día (colegio, mercado, trabajo o la casa) y, a veces, un bus. El mosquito del barrio pica con retraso: lo que se infecta hoy se siente en la presión del barrio seis días después. Por eso fumigar no apaga el caso de esta mañana, pero sí la ola que viene.

## Qué hace el Comité cada mañana

Mira solo lo que ya se puede ver: quién está infeccioso y hace al menos un día que salió en el parte. El foco inicial ya viene en el parte.

Calcula, para cada acción legal, cuántos contagios evitaría si el día de hoy se repitiera unos días:

1. Aislar a un infeccioso que todavía va al mercado, al colegio o al bus. Sale de ahí, pero no del todo: queda un 40 % de presencia. En la casa no se corta nada, porque el mosquito del domicilio sigue.
2. Fumigar un barrio con casos. Seis días a mitad de presión en casas y en el ambiente.
3. Cerrar colegio o mercado cinco días, solo si eso evita más de lo que empuja de vuelta a las casas.
4. Vacunar sanos. Nunca a un infeccioso, un incubando, un inmune o alguien que ya tiene dosis. La protección es la eficacia del escenario (65 % en la base).

Ordena por contagios evitados por dólar. Si la mejor jugada no cabe en la caja de hoy, no rellena con dosis malas: el dinero pasa a mañana.

## Las dos líneas base

- No intervenir: caja cerrada.
- Al azar: el mismo presupuesto, las mismas acciones legales, el blanco elegido sin mirar el mapa. Puede vacunar a un sano de Santa Marianita mientras el foco está en Eloy Alfaro. No puede vacunar a un enfermo: esa trampa se la prohibimos también al azar, para que la comparación sea de estrategia y no de error.

La misma semilla arma la misma ciudad y el mismo dado para las tres. Aislar a alguien no le cambia la suerte al vecino que no tocamos.

## El número de la base

Semilla `20261030`, 20 corridas, 1.600 personas, 72 días, foco de 4 en un hogar de Eloy Alfaro, 280 USD al día.

| Política | Contagios medios | Rango p10–p90 | Pico | Muertes del escenario |
| --- | --- | --- | --- | --- |
| Nada | 816 | 568–1065 | 139 | 5,1 |
| Azar | 374 | 213–569 | 66 | 1,0 |
| Comité | 24 | 10–42 | 5 | 0 |

El Comité gana las 20 corridas contra las dos líneas. Evita unos 792 contagios frente a no hacer nada (entre 543 y 1.030) y unos 350 frente al azar. Gasta unos 11.700 USD de los 20.160 disponibles. El azar se gasta casi todo.

Esos números salen de `npm run snapshot`. Si cambian el código, vuelvan a correrlo antes de citarlos.

## Si el jurado pregunta

**¿Por qué casi no hay muertos?** Porque en la base el Comité no deja crecer el pico. Sin intervención el escenario sí produce muertes, alrededor de 5 en la ciudad de 1.600. La tasa no es la del MSP: es la consecuencia de llenar las camas. Está escrito en el README.

**¿Por qué el Comité gasta menos?** Porque una dosis en alguien sin riesgo no cuenta como uso inteligente del recurso. El azar tiene el mismo techo y aun así contagia más. Mostramos gasto y contagios juntos.

**¿Y si la semilla del jurado empata?** Puede pasar si las dos políticas apagan el foco en los 4 casos iniciales: no se puede bajar de ahí. En la semilla documentada no pasa (20 de 20). Si pasa en vivo, se dice, y se muestran las 20 corridas: el promedio no empata.

**¿Vacunan a infectados?** No. El código lanza un error si lo intenta, y el test lo recorre. La eficacia 0 gasta cero dosis.

**¿De dónde salen los beta?** No de una tabla del MSP. Se eligieron para que, sin intervención, el ataque en 72 días quede cerca de la mitad de la ciudad simulada y la descendencia directa del foco sea del orden de 9 personas (unas 2 por caso inicial). El README lo dice así, sin llamarlo ajuste estadístico a los 105 casos de Manta.

**Brote sorpresa.** Los botones cambian un parámetro y vuelven a correr. Doble contagio, mitad de presupuesto, mercado central, vacuna al 32 %. La regla no se reprograma: al subir el contagio sube el valor de cerrar y de fumigar; al bajar la eficacia, la vacuna pierde prioridad sola.
