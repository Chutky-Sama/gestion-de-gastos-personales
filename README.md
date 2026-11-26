# Neon Kakeibo · Gestión Mensual de Gastos Personales (`家計簿 · 가계부 · 记账本`)

Sistema personal de control y división mensual de tu dinero, inspirado en las libretas tradicionales de finanzas del hogar de **Japón (*Kakeibo* 家計簿)**, **Corea (*Gagyebu* 가계부)** y **China (*Ji Zhang Ben* 记账本)**, con una interfaz moderna estilo **Cyber-Neon**.

## Características principales

1. **Definición de Salario Actual y Moneda**:
   - Configura tu salario mensual actual y elige tu moneda (`$`, `RD$`, `MX$`, `COL$`, `S/`, `AR$`, `CLP$`, `€`, etc.).
2. **División Inteligente del Dinero por Sobres (`袋分け家計簿`)**:
   - **Gastos del Hogar** (directo o desglosado por alquiler, servicios, supermercado, etc.).
   - **Deudas** (directo o desglosado por tarjetas, préstamos y cuotas).
   - **Manutenciones (si hay)** (interruptor activable solo cuando aplique).
   - **Inversiones personalizables** (crea y gestiona cada inversión: ETFs/Acciones, Cripto, Plazo Fijo, Negocio, Bienes Raíces o Fondos, con seguimiento mensual e histórico).
   - **Dinero de Bolsillo (`お小遣い · 용돈`)**: calcula automáticamente cuánto dinero libre te queda tras cubrir tus obligaciones e inversiones (o te alerta si tus divisiones superan tu presupuesto del mes).
3. **Libreta Asiática con Saldo General Vivo (`出納帳 · 입출금 잔액 · 收支结余`)**:
   - Modifica el **Dinero General del Mes** tanto si **crece (`+`)** como si **baja (`-`)**, o haz un **arqueo a monto exacto** en cualquier momento.
   - Renglón por renglón ves la **Entrada (+)**, **Salida (-)** y el **Saldo General resultante**.
   - Incluye desglose por las **5 semanas del mes**, los **Pilares de Conciencia Financiera Kakeibo** y la **Reflexión Mensual**.
4. **Registro Permanente Desde el Día 1**:
   - Guarda automáticamente todos tus meses, movimientos, inversiones y bitácora histórica en disco local (`data/kakeibo-store.json` + copia de seguridad `.bak.json`).
   - Permite exportar respaldos `.JSON` y hojas de cálculo `.CSV` (Excel).

## Cómo ejecutarlo en tu computadora

Requiere **Node.js 18+** instalado.

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el programa (modo interactivo local)
npm run dev
```

Luego abre en tu navegador: `http://localhost:3000`
