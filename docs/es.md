# Grocy

Lleve [Grocy](https://grocy.info), el «ERP más allá de la nevera»
autoalojado, a Gladys a través de su red local: lo que hay que consumir
primero, las tareas del hogar del día, la lista de la compra y las baterías por
cargar, en el panel y en sus escenas. Un botón, una presencia o el robot
aspirador pueden entonces decirle a Grocy lo que ha pasado: un producto
consumido, un artículo por comprar, una tarea hecha, una batería cargada.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se ha construido y probado con las respuestas documentadas por
> Grocy (su especificación OpenAPI) y con respuestas reales de un Grocy
> grabadas por la biblioteca pygrocy, no con un Grocy en funcionamiento. Si
> algo no funciona como se describe, indíquelo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-grocy/issues).

## Qué necesita

- Gladys Assistant 5.2.0 o posterior.
- **Grocy** 3.3 o posterior (se recomienda Grocy 4), accesible desde Gladys: en
  un NAS, una Raspberry Pi, Docker, Unraid, Proxmox, o el complemento de Home
  Assistant si su puerto está publicado.
- Una **clave de API** de Grocy. Abra Grocy, haga clic en su nombre de usuario
  (arriba a la derecha) → **Administrar las claves de API** → **Añadir**, y
  copie la clave. La integración actúa en nombre del usuario dueño de la
  clave: las tareas que marca como hechas las hace ese usuario.

## Instalación

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección de Grocy**, la que usa para
   abrir Grocy, por ejemplo `http://192.168.1.10:9283`. Si Grocy se sirve en
   un subdirectorio (`https://nas.example.com/grocy`), consérvelo. Pegue la
   **Clave de API**.
3. ¿HTTPS con su propio certificado (NAS, proxy inverso)? Marque **Aceptar
   certificados autofirmados**.
4. Si lo desea, ajuste **Fecha próxima: dentro de (días)** (5 por defecto,
   como en Grocy), el **Número de la lista de la compra** (1 es la lista por
   defecto de Grocy), el **Intervalo de actualización** y el **Idioma de los
   nombres de funciones**.
5. Guarde y haga clic en **Probar la conexión**: el mensaje bajo el botón
   indica la versión de Grocy y lo que está pendiente.
6. Abra la pestaña **Descubrir**: aparece el dispositivo **Grocy**. Haga clic
   en **Añadir**.

## El dispositivo Grocy

Un dispositivo para su Grocy, con contadores (números, con historial), cada uno
correspondiente a lo que Grocy muestra en rojo o naranja:

| Función                            | Qué cuenta                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Productos con fecha próxima        | Productos cuya fecha cae en la ventana «fecha próxima», hoy incluido            |
| Productos con fecha superada       | Productos pasada su fecha de consumo preferente (a menudo aún buenos)           |
| Productos caducados                | Productos pasada su fecha de caducidad (para tirar)                             |
| Productos bajo existencias mín.    | Productos por debajo del mínimo de existencias definido en Grocy                |
| Artículos en la lista de la compra | Artículos aún no comprados de la lista elegida                                  |
| Tareas del hogar de hoy            | Tareas del hogar previstas para más tarde hoy                                   |
| Tareas del hogar atrasadas         | Tareas del hogar cuya hora prevista ha pasado                                   |
| Baterías por recargar              | Baterías por cargar hoy o ya atrasadas (solo las que tienen intervalo de carga) |
| Tareas de hoy                      | Tareas abiertas con fecha límite hoy                                            |
| Tareas atrasadas                   | Tareas abiertas cuya fecha límite ha pasado                                     |

Los nombres de las funciones se fijan al añadir el dispositivo, en el idioma de
la configuración. Úselos en las escenas con el disparador habitual de Gladys
«el valor de un dispositivo cambia» (por ejemplo _Tareas del hogar atrasadas_
mayor que 0 a las 20 h).

## Widgets del panel

Añádalos desde el editor del panel, bajo la integración:

- **Consumir primero**: los productos caducados, luego los que tienen la fecha
  superada, luego los de fecha próxima, con su cantidad y su fecha.
- **Para hacer hoy**: las tareas del hogar y las tareas de hoy o atrasadas, y
  las baterías por cargar, las atrasadas primero. Las cuatro primeras tienen un
  botón con su nombre: una pulsación marca en Grocy la tarea del hogar como
  hecha, la tarea como completada o la batería como cargada.
- **Lista de la compra**: los artículos por comprar, y dos botones. **Añadir
  los que faltan** pone en la lista los productos por debajo de su mínimo de
  existencias. **Añadir…** abre un pequeño formulario: un producto o cualquier
  texto, y una cantidad.

## Escenas

### Disparadores

- **Un producto va a caducar**: una vez por producto y fecha, cuando la fecha
  del producto se acerca, y de nuevo cuando ha pasado. Filtros: el nombre exacto
  del producto en Grocy (vacío: todos), y cuándo (_Fecha próxima_, _Fecha de
  consumo preferente superada_, _Caducado (fecha de caducidad superada)_).
  Información transmitida a la escena: producto, fecha, días restantes
  (negativo una vez pasada), cantidad en existencias.
- **Una tarea del hogar está atrasada**: cuando pasa la hora prevista de una
  tarea del hogar sin que se haya hecho. Filtros: el nombre exacto de la tarea
  en Grocy y el usuario de Grocy al que está asignada (vacío: todos).
  Información transmitida a la escena: tarea del hogar, asignada a, hora
  prevista.

Lo que ya está pendiente en el primer arranque de la integración se considera
conocido: solo lo que pasa a estarlo después activa las escenas. Lo anunciado
se guarda en los datos de la integración: un reinicio no lo anuncia de nuevo.

### Acciones

- **Consumir un producto de Grocy**: retira una cantidad de las existencias. El
  producto se encuentra por su nombre (sin tener en cuenta mayúsculas ni
  acentos; basta una parte del nombre cuando un solo producto la contiene) o por
  su código de barras. Active _Tirado (desperdiciado)_ para registrarlo como
  desperdicio. Devuelve el producto, la cantidad consumida y la cantidad
  restante en existencias.
- **Añadir a la lista de la compra de Grocy**: el producto con ese nombre
  exacto, o una línea de texto libre si ningún producto lo tiene (nunca otro
  producto). Nota opcional. Devuelve el artículo, si es un producto conocido, y
  el número de artículos en la lista.
- **Marcar una tarea del hogar de Grocy como hecha**: registra ahora una
  ejecución de la tarea. Devuelve la tarea y su próxima fecha prevista.
- **Marcar una batería de Grocy como cargada**: registra ahora un ciclo de
  carga. Devuelve la batería y su próxima carga.

Cada acción se deshace desde el propio Grocy (diario de existencias, diarios de
tareas del hogar y de baterías, lista de la compra). Nunca se borra nada.

### Ideas de escenas

- El robot aspirador vuelve a su base → **Marcar una tarea del hogar de Grocy
  como hecha** «Aspirar el salón».
- **Un producto va a caducar**, cuando _Caducado (fecha de caducidad
  superada)_ → enviar «Tire el {{product}}» a la familia.
- Cada noche a las 20 h, si _Tareas del hogar atrasadas_ es mayor que 0 → un
  mensaje, y la lista _Para hacer hoy_ en la tableta de la cocina.
- Un botón junto a la nevera → **Añadir a la lista de la compra de Grocy**
  «Leche».

## Frecuencia de lectura de Grocy

En cada actualización (cada minuto por defecto), la integración hace a Grocy
una sola pregunta: ¿ha cambiado la base de datos? Todo se vuelve a leer solo si
es así, al cambiar de día y cada 15 minutos; entretanto, lo pendiente se
recalcula a partir de la última lectura y del reloj de Grocy. Una orden
(acción, botón) vuelve a leer Grocy justo después. Grocy no impone ninguna
cuota de peticiones; la carga para un NAS es despreciable. Los contadores solo
se envían a Gladys cuando cambian, y si no, una vez cada 6 horas.

## Solución de problemas

- **«Clave de API rechazada»**: la clave se ha borrado o se ha copiado mal.
  Cree una nueva en Grocy (**Administrar las claves de API**) y péguela de
  nuevo.
- **«Grocy no responde»**: verifique la dirección y el puerto desde un
  navegador en la misma red que Gladys. En Docker, `localhost` es el contenedor
  de la integración, no su servidor: use la dirección IP del servidor.
- **«No hay ninguna API de Grocy en esta dirección»**: la dirección abre otra
  cosa que Grocy (una página del NAS, un proxy inverso), o le falta el
  subdirectorio de Grocy.
- **«Certificado rechazado»**: marque **Aceptar certificados autofirmados**.
- **«La dirección redirige»**: introduzca directamente la dirección `https://`.
- **Un nombre no se encuentra** en una acción: escriba el nombre tal como lo
  muestra Grocy, o una parte única del mismo; para los productos también sirve
  un código de barras.
- **El día cambia a la hora equivocada**: la integración sigue el reloj de
  Grocy (`/api/system/time`). Verifique la zona horaria del servidor de Grocy.
- Registros detallados: ponga la variable `LOG_LEVEL` del contenedor en
  `debug`. La clave de API nunca aparece en los registros.

## Límites

- Desarrollada sin un Grocy en funcionamiento: construida sobre la
  especificación de Grocy y sobre respuestas grabadas de un Grocy real.
- Un solo Grocy por Gladys. Una sola lista de la compra (elegida en la
  configuración).
- Los nombres de productos y tareas se escriben en las escenas: Gladys no puede
  proponerlos en un menú.
- Los botones del widget y los contadores actúan en nombre del usuario dueño de
  la clave de API.
- Las cantidades de las acciones son números enteros, en la unidad de
  existencias del producto.
- Las recetas, los menús y el equipamiento no están cubiertos.

Grocy pertenece a sus autores. Esta integración no está afiliada al proyecto
Grocy.
