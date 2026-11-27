# Neon Kakeibo · Programa de Escritorio para Windows (`NeonKakeibo.exe`)

Sistema personal de gestión mensual de gastos e inversiones con estética **Cyber-Neon**, inspirado en las libretas tradicionales de finanzas del hogar de **Japón (*Kakeibo* 家計簿)**, **Corea (*Gagyebu* 가계부)** y **China (*Ji Zhang Ben* 记账本)**, adaptado a la realidad de pagos en paralelo (**Efectivo** y **Transferencia**) y múltiples monedas (**CUP**, **USD**, **MLC**, **EUR**, etc.).

---

## Descarga Directa para Windows (Sin instalar nada)

No necesitas instalar Node.js, ni Python, ni abrir ninguna consola:

1. Descarga el archivo **`NeonKakeibo.exe`** directamente desde el repositorio (~1.05 MB, todo integrado en un solo ejecutable sin dependencias externas).
2. Haz **doble clic en `NeonKakeibo.exe`**.
   > **Nota de Windows:** Como es un programa personal creado a medida (sin certificado comercial de Microsoft Store), la primera vez que lo abras puede aparecer el aviso azul *"Windows protegió su PC"*. Solo haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.
3. ¡Listo! Se abrirá en su propia ventana oscura de escritorio. Si ya usabas una versión previa, tus datos anteriores se migran automáticamente sin perder nada.

### ¿Dónde se guardan tus registros desde el Día 1?
* **Automáticamente en tu PC:** Todos tus meses, monedas, salarios, inversiones y movimientos se guardan al instante en:
  `C:\Users\<TuUsuario>\AppData\Local\NeonKakeibo\kakeibo-store.json` (con respaldo automático `.bak.json`).
* **Modo Portable (USB):** Si creas una carpeta llamada `datos_portables` justo al lado de `NeonKakeibo.exe`, el programa guardará todos tus datos dentro de esa carpeta para que puedas llevarlo en una memoria USB.
* Dentro de **Historial y Respaldo** tienes:
  * **Salva Automática Programada en Segundo Plano (`--silent-backup`):** Elige frecuencia (*semanal, mensual o diaria*), hora, carpeta/partición/USB de destino y rotación de copias. Se ejecuta sola mediante el **Programador de Tareas de Windows** sin abrir ninguna ventana ni consumir RAM, y si la PC estaba apagada ese día, crea la salva pendiente apenas enciendas Windows.
  * Botón **"Abrir carpeta de datos"** y exportación manual directa a **Excel (`.CSV`)** o respaldo **`.JSON`**.

---

## Funcionalidades Principales

* **Control en Paralelo: Efectivo y Transferencia**:
  * Configura tu salario e inicio de mes separando cuánto recibes en **Efectivo** y cuánto por **Transferencia**.
  * Registra cada gasto, ingreso o aporte a inversión indicando si fue en **Efectivo** o **Transferencia**.
  * **Pasar Efectivo ⇄ Transferencia con Comisión en `%` o `$`:** Registra extracciones o cambios entre transferencia y efectivo calculando automáticamente el porcentaje de comisión (`%`) o monto fijo y mostrando al instante cuánto sale, cuánto se descuenta y cuánto recibes neto.
  * **Columnas en paralelo en el Libro Diario:** Visualiza renglón por renglón tu **Saldo Efectivo**, **Saldo Transferencia** y **Total General**.
  * **Ajuste directo (`+` / `-` / Monto exacto)** independiente para Efectivo o Transferencia.
* **Gastos del Hogar con Cuadrícula Visual Estilo *"Mis Gastos"*:**
  * Cuadrícula circular de íconos rápidos (`Compras`, `Alimentos`, `Teléfono`, `Entretenimiento`, `Educación`, `Belleza`, `Deportes`, `Social`, `Transporte`, `Ropa`, `Auto`, `Bebidas`, `Cigarrillos`, `Electrónica`, `Viajes`, `Salud`, `Mascotas`, `Reparaciones`, `Vivienda`, `Hogar`, `Regalos`, `Donaciones`, `Lotería`, `Snacks`, `Hijos`, `Verduras`, `Frutas`, servicios y botón **`+ Ajustes`** para crear categorías propias) tanto al asignar sobres como al registrar gastos diarios.
* **Calendario Desplegable Extendido y Selector Multi-Año / Mes:**
  * Navega desde la barra superior abriendo la cuadrícula completa de días del mes (con ingresos/gastos diarios y filtro por día con 1 clic) o el selector de **12 meses y múltiples años**.
* **Centro de Informes y Gráficos (`Informes y Gráficos` · 100% Offline):**
  * Gráficos interactivos en tiempo real: **Anillo / Pastel (Donut)** por categorías del hogar, sobres o pilares Kakeibo; **Curva Diaria de Saldos** (Total, Efectivo y Transferencia); **Barras Verticales Comparativas** (5 semanas y Planificado vs. Real); ** División por Canal (`Efectivo` vs `Transferencia`)** y **Comparativa Histórica Multimes**.
* **Ventanas Emergentes Protegidas:** Ningún modal se cierra al hacer clic accidental fuera de él, evitando perder cambios sin guardar.
* **Monedas de Cuba y Multimoneda en Paralelo (`CUP`, `USD`, `MLC`, `EUR`...)**:
  * Incluye **Peso Cubano (`CUP`)**, **Dólar Estadounidense (`USD`)**, **`MLC`**, **Euro (`EUR`)** y monedas internacionales adicionales.
  * Cambia con 1 clic en la barra superior entre tu libreta en **`CUP`** y tu libreta en **`USD`** (u otras monedas habilitadas) sin mezclar saldos.
* **Pestaña de Cambio de Monedas en Base `CUP` (100% Local · Sin Internet)**:
  * **Pizarra Manual de Tasas:** Ingresa tú mismo a cuánto está cada moneda en **`CUP`** cuando lo necesites, con opción de diferenciar **Tasa en Efectivo** y **Tasa por Transferencia**, más historial local de variaciones.
  * **Patrimonio Total Consolidado en `CUP` (y ref. `USD`):** Suma en tiempo real todas tus libretas activas valoradas en tu moneda nativa `CUP`.
  * **Calculadora Bidireccional + Cambio Real entre Libretas:** Convierte cualquier par de monedas y, si hiciste un cambio real, descuenta de una libreta y acredita en la otra en un solo clic.
  * **Comparador Rápido Callejero:** Compara al instante si te conviene pagar un precio pedido en `CUP` o el precio equivalente pedido en divisa (`USD` / `MLC` / `EUR`).
* **Sello Personal Integrado:** Ícono personalizado multi-resolución incrustado en `NeonKakeibo.exe`, ventana de aplicación y cabecera.
* **Protección Anti-Borrado: Demo y Reinicio de Un Solo Uso**:
  * Los datos de prueba **Demo** son estrictamente de **un solo uso**.
  * La opción para **reiniciar / limpiar** el programa existe **únicamente una sola vez para salir de la Demo**. En cuanto pasas al uso real (o ingresas tus propios datos), el botón de reinicio queda **desactivado y oculto permanentemente** para que jamás puedas borrar tus registros reales por accidente.
* **División Mensual por Sobres (`袋分け家計簿`)**:
  1. **Gastos del Hogar** · 2. **Deudas** · 3. **Manutenciones (si hay)** · 4. **Inversiones definibles** · 5. **Dinero de Bolsillo (`お小遣い · 용돈`)**.

---

## Desarrollo / Compilación desde código fuente (Opcional)

```bash
npm install
npm run dev        # Modo desarrollo local
npm run build:exe  # Recompilar NeonKakeibo.exe
```
