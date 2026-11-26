# Neon Kakeibo · Programa de Escritorio para Windows (`NeonKakeibo.exe`)

Sistema personal de gestión mensual de gastos e inversiones con estética **Cyber-Neon**, inspirado en las libretas tradicionales de finanzas del hogar de **Japón (*Kakeibo* 家計簿)**, **Corea (*Gagyebu* 가계부)** y **China (*Ji Zhang Ben* 记账本)**, adaptado a la realidad de pagos en paralelo (**Efectivo** y **Transferencia**) y múltiples monedas (**CUP**, **USD**, **MLC**, **EUR**, etc.).

---

## Descarga Directa para Windows (Sin instalar nada)

No necesitas instalar Node.js, ni Python, ni abrir ninguna consola:

1. Descarga el archivo **`NeonKakeibo.exe`** directamente desde el repositorio (pesa ~675 KB y trae todo integrado en un solo ejecutable).
2. Haz **doble clic en `NeonKakeibo.exe`**.
   > **Nota de Windows:** Como es un programa personal creado a medida (sin certificado comercial de Microsoft Store), la primera vez que lo abras puede aparecer el aviso azul *"Windows protegió su PC"*. Solo haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.
3. ¡Listo! Se abrirá en su propia ventana oscura de escritorio. Si ya usabas una versión previa, tus datos anteriores se migran automáticamente sin perder nada.

### ¿Dónde se guardan tus registros desde el Día 1?
* **Automáticamente en tu PC:** Todos tus meses, monedas, salarios, inversiones y movimientos se guardan al instante en:
  `C:\Users\<TuUsuario>\AppData\Local\NeonKakeibo\kakeibo-store.json` (con respaldo automático `.bak.json`).
* **Modo Portable (USB):** Si creas una carpeta llamada `datos_portables` justo al lado de `NeonKakeibo.exe`, el programa guardará todos tus datos dentro de esa carpeta para que puedas llevarlo en una memoria USB.
* Dentro de **Historial Día 1 y Respaldo** tienes un botón **"Abrir carpeta de datos"** y exportación directa a **Excel (`.CSV`)** o respaldo **`.JSON`**.

---

## Funcionalidades Principales

* **Control en Paralelo: Efectivo y Transferencia**:
  * Configura tu salario e inicio de mes separando cuánto recibes en **Efectivo** y cuánto por **Transferencia**.
  * Registra cada gasto, ingreso o aporte a inversión indicando si fue en **Efectivo** o **Transferencia**.
  * **Pasar Efectivo ⇄ Transferencia:** Registra extracciones de *Caja Extra* / cajero o cambios entre transferencia y efectivo (con comisión opcional si aplica).
  * **Columnas en paralelo en el Libro Diario:** Visualiza renglón por renglón tu **Saldo Efectivo**, **Saldo Transferencia** y **Total General**.
  * **Ajuste directo (`+` / `-` / Monto exacto)** independiente para Efectivo o Transferencia.
* **Monedas de Cuba y Multimoneda en Paralelo (`CUP`, `USD`, `MLC`, `EUR`...)**:
  * Incluye **Peso Cubano (`CUP`)**, **Dólar Estadounidense (`USD`)**, **`MLC`**, **Euro (`EUR`)** y monedas internacionales adicionales.
  * Cambia con 1 clic en la barra superior entre tu libreta en **`CUP`** y tu libreta en **`USD`** (u otras monedas habilitadas) sin mezclar saldos.
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
