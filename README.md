# Neon Kakeibo · Programa de Escritorio para Windows (`NeonKakeibo.exe`)

Sistema personal de gestión mensual de gastos e inversiones con estética **Cyber-Neon**, inspirado en las libretas tradicionales de finanzas del hogar de **Japón (*Kakeibo* 家計簿)**, **Corea (*Gagyebu* 가계부)** y **China (*Ji Zhang Ben* 记账本)**.

---

## Descarga Directa para Windows (Sin instalar nada)

No necesitas instalar Node.js, ni Python, ni abrir ninguna consola:

1. Descarga el archivo **`NeonKakeibo.exe`** directamente desde el repositorio (pesa menos de **1 MB** y trae todo integrado en un solo ejecutable).
2. Haz **doble clic en `NeonKakeibo.exe`**.
   > **Nota de Windows:** Como es un programa personal creado a medida (sin certificado comercial de Microsoft Store), la primera vez que lo abras puede aparecer el aviso azul *"Windows protegió su PC"*. Solo haz clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.
3. ¡Listo! Se abrirá en su propia ventana oscura de escritorio.

### ¿Dónde se guardan tus registros desde el Día 1?
* **Automáticamente en tu PC:** Todos tus meses, salarios, inversiones y movimientos se guardan al instante en:
  `C:\Users\<TuUsuario>\AppData\Local\NeonKakeibo\kakeibo-store.json` (con respaldo automático `.bak.json`).
  Así puedes mover `NeonKakeibo.exe` de *Descargas* a tu *Escritorio* sin perder jamás tus datos.
* **Modo Portable (USB):** Si creas una carpeta llamada `datos_portables` justo al lado de `NeonKakeibo.exe`, el programa guardará todos tus datos dentro de esa carpeta para que puedas llevarlo en una memoria USB.
* Dentro de la pestaña **Registro Día 1** tienes además un botón **"Abrir Carpeta en Windows"** y botones para exportar a **Excel (`.CSV`)** o respaldo **`.JSON`**.

---

## Funcionalidades Incluidas

* **Salario Actual y Moneda Configurable** (`$`, `RD$`, `MX$`, `COL$`, `S/`, `AR$`, `CLP$`, `€`, etc.).
* **División Mensual por Sobres (`袋分け家計簿`)**:
  1. **Gastos del Hogar** (monto directo o desglosado).
  2. **Deudas** (monto directo o desglosado).
  3. **Manutenciones (si hay)** (interruptor activable solo si aplica).
  4. **Inversiones definibles** (crea y gestiona cada inversión individualmente con seguimiento mensual e histórico).
  5. **Dinero de Bolsillo (`お小遣い · 용돈`)** calculado automáticamente si llega a quedar remanente.
* **Libreta Asiática con Saldo General Vivo (`出納帳 · 입출금 잔액 · 收支结余`)**:
  * Sube (`+`), baja (`-`) o cuadra a monto exacto el **Dinero General del Mes** en cualquier momento.
  * Resumen por las **5 semanas del mes**, **Pilares Kakeibo** y **Reflexión Mensual**.

---

## Desarrollo / Compilación desde código fuente (Opcional)

```bash
npm install
npm run dev        # Modo desarrollo local
npm run build:exe  # Recompilar NeonKakeibo.exe
```
