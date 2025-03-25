// preventa.js - Lógica exclusiva para PREVENTA

/**
 * Genera el HTML con el resumen del carrito.
 * Retorna un string que se mostrará en el formulario de preventa.
 */
function getCartSummaryHtml(cart) {
    let total = parseFloat(document.getElementById("totalVenta")?.textContent || "0");
    let resumenHtml = "";
    cart.forEach(item => {
      let subt = item.cantidad * item.precio;
      resumenHtml += `
        <p><strong>${item.producto}</strong> (${item.producto_codigo})<br>
           Cant: ${item.cantidad} x Q${item.precio.toFixed(2)} = Q${subt.toFixed(2)}</p>
      `;
    });
    resumenHtml += `<h4>Venta Total: Q${total.toFixed(2)}</h4>`;
    return resumenHtml;
  }
  
  /**
   * Maneja toda la lógica de la preventa: 
   * 1. Pide el código del cliente
   * 2. Solicita datos del cliente, abono, método de pago, etc.
   * 3. Retorna un objeto formData con la información (o `null` si se cancela):
   *    {
   *      clienteData: { nombre, telefono, correo, direccion },
   *      pagoObj: { metodo, montoAbono, numeroTransferencia, ... }
   *    }
   */
  export async function handlePreventa(cart) {
    const totalVenta = parseFloat(document.getElementById("totalVenta")?.textContent || "0");
  
    // Paso 1: Pedir el código del cliente
    const { value: clientCode } = await Swal.fire({
      title: "Código del Cliente",
      input: "text",
      inputLabel: "Ingrese el código del cliente",
      inputPlaceholder: "Código del cliente",
      preConfirm: () => {
        const code = Swal.getInput().value.trim();
        if (!code) {
          Swal.showValidationMessage("El código es obligatorio");
          return;
        }
        return code;
      }
    });
    if (!clientCode) return null; // Usuario canceló
  
    let clientName = clientCode; // Por defecto, asumimos el mismo valor como nombre inicial
  
    // Paso 2: Mostrar formulario de preventa (abono, método de pago, etc.)
    const result = await Swal.fire({
      title: "Procesar Venta - Preventa",
      html: `
        <h4>Datos del Cliente</h4>
        <input type="text" id="clienteNombre" class="swal2-input" placeholder="Nombre y Apellido" value="${clientName}">
        <input type="text" id="clienteTelefono" class="swal2-input" placeholder="Teléfono">
        <input type="email" id="clienteCorreo" class="swal2-input" placeholder="Correo (opc)">
        <input type="text" id="clienteDireccion" class="swal2-input" placeholder="Dirección (opc)">
        <hr>
        <h4>Detalle de la Venta</h4>
        ${getCartSummaryHtml(cart)}
        
        <!-- Selección método de pago -->
        <select id="metodoPago" class="swal2-select">
          <option value="Efectivo">Efectivo</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Transferencia">Transferencia</option>
        </select>
        
        <!-- Contenedor para abono (Efectivo / Tarjeta) -->
        <div id="pagoAbonoContainer">
          <input type="number" id="montoAbono" class="swal2-input" placeholder="Monto de Abono (Q)">
        </div>
        
        <!-- Contenedor para Transferencia -->
        <div id="numeroTransferenciaContainer" style="display: none;">
          <input type="text" id="numeroTransferencia" class="swal2-input" placeholder="Número de Referencia">
        </div>
        
        <!-- Texto para mostrar saldo pendiente -->
        <div id="txtPendiente" style="margin-top: 10px; font-weight:bold;"></div>
      `,
      focusConfirm: false,
      preConfirm: () => {
        // Validaciones en tiempo real cuando se hace clic en Aceptar
        const nombre = document.getElementById("clienteNombre").value.trim();
        const telefono = document.getElementById("clienteTelefono").value.trim();
        if (!nombre) {
          Swal.showValidationMessage("El nombre es obligatorio");
          return;
        }
        if (!telefono) {
          Swal.showValidationMessage("El teléfono es obligatorio");
          return;
        }
        let clienteData = {
          nombre,
          telefono,
          correo: document.getElementById("clienteCorreo").value.trim(),
          direccion: document.getElementById("clienteDireccion").value.trim()
        };
        let metodo = document.getElementById("metodoPago").value;
        let pagoObj = { metodo };
        
        // Efectivo o Tarjeta => se puede ingresar abono
        if (metodo === "Efectivo" || metodo === "Tarjeta") {
          let montoAbono = parseFloat(document.getElementById("montoAbono").value) || 0;
          if (montoAbono <= 0) {
            Swal.showValidationMessage("El monto de abono debe ser mayor a 0");
            return;
          }
          if (montoAbono > totalVenta) {
            Swal.showValidationMessage("El abono no puede ser mayor que el total");
            return;
          }
          pagoObj.montoAbono = montoAbono;
        }
        
        // Transferencia => se pide número de referencia
        if (metodo === "Transferencia") {
          let numTransferencia = document.getElementById("numeroTransferencia").value.trim();
          if (!numTransferencia) {
            Swal.showValidationMessage("Ingrese el número de Referencia");
            return;
          }
          pagoObj.numeroTransferencia = numTransferencia;
        }
  
        // Devuelve el objeto con toda la información
        return { clienteData, pagoObj };
      },
      didOpen: () => {
        // Configuraciones y eventos dentro del modal
        const metodoSelect = document.getElementById("metodoPago");
        const abonoContainer = document.getElementById("pagoAbonoContainer");
        const transferenciaContainer = document.getElementById("numeroTransferenciaContainer");
        const abonoInput = document.getElementById("montoAbono");
        const txtPendiente = document.getElementById("txtPendiente");
        
        function updatePendiente() {
          let abonoVal = parseFloat(abonoInput.value) || 0;
          let pendienteVal = totalVenta - abonoVal;
          if (pendienteVal < 0) pendienteVal = 0;
          txtPendiente.textContent = "Saldo Pendiente: Q" + pendienteVal.toFixed(2);
        }
  
        // Cambio de método de pago
        metodoSelect.addEventListener("change", function () {
          if (this.value === "Efectivo" || this.value === "Tarjeta") {
            abonoContainer.style.display = "block";
            transferenciaContainer.style.display = "none";
            abonoInput.value = "";
            updatePendiente();
          } else if (this.value === "Transferencia") {
            abonoContainer.style.display = "none";
            transferenciaContainer.style.display = "block";
            abonoInput.value = "";
            txtPendiente.textContent = "";
          } else {
            abonoContainer.style.display = "none";
            transferenciaContainer.style.display = "none";
            abonoInput.value = "";
            txtPendiente.textContent = "";
          }
        });
  
        // Actualizar saldo pendiente al cambiar abono
        abonoInput.addEventListener("input", updatePendiente);
  
        // Inicializamos por defecto en Efectivo
        metodoSelect.value = "Efectivo";
        abonoContainer.style.display = "block";
        transferenciaContainer.style.display = "none";
        updatePendiente();
      }
    });
  
    // Paso 3: Si el usuario cancela o no ingresa datos, retorna null
    if (!result.value) return null;
    // Caso contrario, retorna los datos
    return result.value;
  }
  