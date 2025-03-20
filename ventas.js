// ventas.js - Gestión de Ventas
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  query,
  orderBy,
  getDocs,
  getDoc,
  writeBatch,
  onSnapshot,
  where,
  addDoc,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Variables globales para Ventas
let productos = [];
export let cart = [];

// Datos del usuario y tienda  
const usuarioActual = localStorage.getItem("loggedUser") || "admin";
const loggedUserRole = localStorage.getItem("loggedUserRole") || "";
// Se espera que window.currentStore esté definido (por ejemplo, asignado en aperturacaja.js o en index.html)
export let currentStore = window.currentStore || "";

// Si el usuario no es Admin (por ejemplo, "Sucursal"), asigna automáticamente la tienda asociada.
if (loggedUserRole.toLowerCase() !== "admin") {
  currentStore = localStorage.getItem("loggedUserStore") || currentStore;
  window.currentStore = currentStore;
}

// Genera un ID autoincremental para ventas consultando la colección "ventas".
// Se usa el campo numérico "idVenta" para mantener la secuencia.
export async function generarIdVentaCorta() {
  try {
    const ventasRef = collection(db, "ventas");
    const q = query(ventasRef, orderBy("idVenta", "desc"), limit(1));
    const snapshot = await getDocs(q);
    let nextId = 1;
    if (!snapshot.empty) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        nextId = parseInt(data.idVenta) + 1;
      });
    }
    return nextId;
  } catch (error) {
    console.error("Error generando ID de venta:", error);
    return Math.floor(Math.random() * 9000) + 1000;
  }
}

/**
 * Formatea una fecha a dd/mm/yyyy
 */
export function formatDate(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Parsea una cadena de fecha en formato dd/mm/yyyy a un objeto Date
 */
export function parseDate(dateStr) {
  if (dateStr.indexOf("/") > -1) {
    const parts = dateStr.split("/");
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  } else {
    return new Date(dateStr);
  }
}

/**
 * Función para obtener el nombre del empleado a partir de su código.
 * Se asigna a window para uso global.
 */
export async function getEmployeeName(codigo) {
  try {
    const empleadosRef = collection(db, "empleados");
    const q = query(empleadosRef, where("codigo", "==", codigo.toUpperCase()));
    const snapshot = await getDocs(q);
    let empName = "";
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      empName = data.nombre;
    });
    return empName || codigo;
  } catch (error) {
    console.error("Error al obtener nombre de empleado:", error);
    return codigo;
  }
}
window.getEmployeeName = getEmployeeName;

/**
 * Escucha la colección "productos" y actualiza la lista en tiempo real.
 */
export function listenProducts() {
  const qProducts = query(collection(db, "productos"), orderBy("createdAt", "desc"));
  onSnapshot(
    qProducts,
    (snapshot) => {
      productos = [];
      snapshot.forEach(docSnap => {
        let prod = docSnap.data();
        prod.id = docSnap.id;
        productos.push(prod);
      });
      renderProducts();
    },
    (error) => {
      console.error("Error en onSnapshot:", error);
      Swal.fire("Error", "No se pudieron obtener los productos: " + error.message, "error");
    }
  );
}

/**
 * Renderiza los productos en el nodo "productsBody".
 * Se asume que en el HTML existen elementos con IDs "searchInput", "sizeFilter" y "productsBody".
 */
export function renderProducts() {
  // Actualiza currentStore según la opción elegida en el combobox
  const storeSelect = document.getElementById("storeSelect");
  if (storeSelect) {
    currentStore = storeSelect.value;
  }
  
  const searchQuery = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const sizeFilter = (document.getElementById("sizeFilter")?.value || "").toLowerCase();
  const tbody = document.getElementById("productsBody");
  tbody.innerHTML = "";
  const filtered = productos.filter(prod => {
    let matchSearch = ((prod.codigo || "").toLowerCase().includes(searchQuery) ||
                       (prod.descripcion || "").toLowerCase().includes(searchQuery));
    let matchSize = true;
    if (sizeFilter) {
      matchSize = ((prod.talla || "").toLowerCase() === sizeFilter);
    }
    return matchSearch && matchSize;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No hay productos con ese filtro</td></tr>`;
    return;
  }
  filtered.forEach(prod => {
    let stockDisplay = 0;
    if (prod.stock && typeof prod.stock === "object") {
      stockDisplay = currentStore
        ? (prod.stock[currentStore] || 0)
        : Object.values(prod.stock).reduce((sum, val) => sum + Number(val), 0);
    } else {
      stockDisplay = prod.stock || 0;
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${prod.codigo}</td>
      <td>${prod.descripcion}</td>
      <td>${prod.talla || ""}</td>
      <td>Q ${parseFloat(prod.precio || 0).toFixed(2)}</td>
      <td>${stockDisplay}</td>
      <td><button class="btn btn-primary btn-sm">Agregar</button></td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#productsBody tr").forEach(row => row.classList.remove("table-active"));
      tr.classList.add("table-active");
    });
    tr.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      agregarProductoAlCarrito(prod.id);
    });
    tbody.appendChild(tr);
  });
}

/**
 * Agrega un producto al carrito.
 */
export async function agregarProductoAlCarrito(productId) {
  const prod = productos.find(p => p.id === productId);
  if (!prod) return;
  let stockDisponible = 0;
  if (prod.stock && typeof prod.stock === "object") {
    stockDisponible = currentStore
      ? (prod.stock[currentStore] || 0)
      : Object.values(prod.stock).reduce((sum, val) => sum + Number(val), 0);
  } else {
    stockDisponible = prod.stock || 0;
  }
  const { value: cantidad } = await Swal.fire({
    title: "Cantidad a Agregar",
    input: "number",
    inputLabel: `Ingrese la cantidad (Stock disp: ${stockDisponible})`,
    inputAttributes: { min: 1, max: stockDisponible, step: 1 },
    inputValidator: (value) => {
      if (!value || value <= 0) return "Cantidad inválida";
      if (value > stockDisponible) return "La cantidad excede el stock disponible";
    }
  });
  if (cantidad) {
    let cantNum = parseInt(cantidad);
    let existing = cart.find(item => item.productId === prod.id);
    if (existing) {
      if (existing.cantidad + cantNum > stockDisponible) {
        Swal.fire("Error", "Cantidad total excede el stock", "error");
        return;
      }
      existing.cantidad += cantNum;
    } else {
      cart.push({
        productId: prod.id,
        producto: prod.descripcion,
        producto_codigo: prod.codigo || "N/A",
        cantidad: cantNum,
        precio: prod.precio
      });
    }
    Swal.fire("Producto agregado", "", "success");
    renderCart();
  }
}

/**
 * Renderiza el carrito en el nodo "cartTable" y actualiza el total.
 */
export function renderCart() {
  const tbody = document.querySelector("#cartTable tbody");
  tbody.innerHTML = "";
  let total = 0;
  cart.forEach((item, idx) => {
    let subt = item.cantidad * item.precio;
    total += subt;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.producto}<br><small>${item.producto_codigo}</small></td>
      <td>${item.cantidad}</td>
      <td>Q ${item.precio.toFixed(2)}</td>
      <td>Q ${subt.toFixed(2)}</td>
      <td><button class="btn btn-danger btn-sm">❌</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => {
      cart.splice(idx, 1);
      renderCart();
    });
    tbody.appendChild(tr);
  });
  document.getElementById("totalVenta").textContent = total.toFixed(2);
}

/**
 * Procesa la venta: verifica que haya caja abierta, genera el objeto venta, actualiza stock y registra la venta.
 * Se relaciona la venta con la apertura activa usando window.idAperturaActivo.
 */
export async function procesarVenta() {
  if (!window.cajaAbierta || !window.idAperturaActivo) {
    Swal.fire("Error", "Debes abrir la caja antes de vender.", "warning");
    return;
  }
  const storeSelect = document.getElementById("storeSelect");
  if (storeSelect) {
    currentStore = storeSelect.value;
    window.currentStore = currentStore;
  }

  if (cart.length === 0) {
    Swal.fire("Carrito vacío", "", "warning");
    return;
  }
  const { value: saleCategory } = await Swal.fire({
    title: "Tipo de Venta",
    input: "radio",
    inputOptions: {
      fisico: "Venta Física",
      online: "Venta en Línea"
    },
    inputValidator: (value) => {
      if (!value) return "Seleccione un tipo de venta";
    }
  });
  if (!saleCategory) return;

  // Solicitar el código del empleado y validarlo contra los empleados registrados
  const { value: empCodigo } = await Swal.fire({
    title: "Código del Empleado",
    input: "text",
    inputLabel: "Ingrese el código del empleado (3 caracteres)",
    inputAttributes: {
      maxlength: 3,
      pattern: "^[A-Za-z0-9]{3}$",
      placeholder: "ABC"
    },
    preConfirm: async () => {
      const code = Swal.getInput().value.trim();
      if (!code || !/^[A-Za-z0-9]{3}$/.test(code)) {
        Swal.showValidationMessage("El código debe tener 3 caracteres alfanuméricos");
        return;
      }
      const nombre = await window.getEmployeeName(code);
      if (nombre === code) {  // Si no se encontró empleado, getEmployeeName retorna el mismo código
        Swal.showValidationMessage("Código de empleado no válido");
        return;
      }
      return code;
    }
  });
  if (!empCodigo) return;
  let empNombre = await window.getEmployeeName(empCodigo);

  let totalVenta = parseFloat(document.getElementById("totalVenta").textContent) || 0;
  let resumenHtml = "";
  cart.forEach(item => {
    let subt = item.cantidad * item.precio;
    resumenHtml += `
      <p><strong>${item.producto}</strong> (${item.producto_codigo})<br>
         Cant: ${item.cantidad} x Q${item.precio.toFixed(2)} = Q${subt.toFixed(2)}</p>
    `;
  });
  resumenHtml += `<h4>Venta Total: Q${totalVenta.toFixed(2)}</h4>`;

  let formData;
  if (saleCategory === "fisico") {
    const result = await Swal.fire({
      title: "Procesar Venta - Física",
      html: `
        <h4>Datos del Cliente</h4>
        <input type="text" id="clienteNombre" class="swal2-input" placeholder="Nombre y Apellido">
        <input type="text" id="clienteTelefono" class="swal2-input" placeholder="Teléfono">
        <input type="email" id="clienteCorreo" class="swal2-input" placeholder="Correo (opc)">
        <input type="text" id="clienteDireccion" class="swal2-input" placeholder="Dirección (opc)">
        <hr>
        <h4>Detalle de la Venta</h4>
        ${resumenHtml}
        <select id="metodoPago" class="swal2-select">
          <option value="Efectivo">Efectivo</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Transferencia">Transferencia</option>
        </select>
        <div id="pagoEfectivoContainer">
          <input type="number" id="montoRecibido" class="swal2-input" value="${totalVenta}" placeholder="Monto recibido (Q)">
        </div>
        <div id="numeroTransferenciaContainer" style="display: none;">
          <input type="text" id="numeroTransferencia" class="swal2-input" placeholder="Número de Referencia">
        </div>
      `,
      focusConfirm: false,
      preConfirm: () => {
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
        if (metodo === "Efectivo") {
          let montoRecibido = parseFloat(document.getElementById("montoRecibido").value) || 0;
          if (montoRecibido < totalVenta) {
            Swal.showValidationMessage("Monto insuficiente para cubrir el total");
            return;
          }
          pagoObj.montoRecibido = montoRecibido;
          pagoObj.cambio = montoRecibido - totalVenta;
        }
        if (metodo === "Transferencia") {
          let numTransferencia = document.getElementById("numeroTransferencia").value.trim();
          if (!numTransferencia) {
            Swal.showValidationMessage("Ingrese el número de Referencia");
            return;
          }
          pagoObj.numeroTransferencia = numTransferencia;
        }
        return { clienteData, pagoObj };
      },
      didOpen: () => {
        const metodoSelect = document.getElementById("metodoPago");
        const efectivoContEl = document.getElementById("pagoEfectivoContainer");
        const transferenciaContEl = document.getElementById("numeroTransferenciaContainer");
        metodoSelect.addEventListener("change", function () {
          if (this.value === "Efectivo") {
            efectivoContEl.style.display = "block";
            transferenciaContEl.style.display = "none";
          } else if (this.value === "Transferencia") {
            efectivoContEl.style.display = "none";
            transferenciaContEl.style.display = "block";
          } else {
            efectivoContEl.style.display = "none";
            transferenciaContEl.style.display = "none";
          }
        });
      }
    });
    formData = result.value;
  } else {
    const result = await Swal.fire({
      title: "Procesar Venta - En Línea",
      html: `
        <h4>Datos del Cliente</h4>
        <input type="text" id="clienteNombre" class="swal2-input" placeholder="Nombre y Apellido">
        <input type="text" id="clienteTelefono" class="swal2-input" placeholder="Teléfono">
        <input type="email" id="clienteCorreo" class="swal2-input" placeholder="Correo (opc)">
        <input type="text" id="clienteDireccion" class="swal2-input" placeholder="Dirección (opc)">
        <hr>
        <h4>Detalle de la Venta</h4>
        ${resumenHtml}
        <input type="text" id="comprobantePago" class="swal2-input" placeholder="Comprobante de Pago">
        <textarea id="comentarioVenta" class="swal2-textarea" placeholder="Comentario (opcional)"></textarea>
      `,
      focusConfirm: false,
      preConfirm: () => {
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
        let comprobante = document.getElementById("comprobantePago").value.trim();
        if (!comprobante) {
          Swal.showValidationMessage("El comprobante de pago es obligatorio");
          return;
        }
        let clienteData = {
          nombre,
          telefono,
          correo: document.getElementById("clienteCorreo").value.trim(),
          direccion: document.getElementById("clienteDireccion").value.trim()
        };
        let pagoObj = {
          metodo: "En Línea",
          comprobante,
          comentario: document.getElementById("comentarioVenta").value.trim()
        };
        return { clienteData, pagoObj };
      }
    });
    formData = result.value;
  }
  if (!formData) return;
  
  // Construir la venta, asociándola a la apertura activa (idApertura = window.idAperturaActivo)
  let venta = {
    idVenta: await generarIdVentaCorta(),
    fecha: new Date().toISOString(),
    cliente: formData.clienteData,
    productos: cart.map(item => ({
      producto_id: item.productId,
      producto_nombre: item.producto,
      producto_codigo: item.producto_codigo,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      subtotal: item.cantidad * item.precio
    })),
    total: totalVenta,
    metodo_pago: formData.pagoObj.metodo,
    cambio: formData.pagoObj.cambio || 0,
    usuario: usuarioActual,
    idApertura: window.idAperturaActivo, // Se asocia a la apertura actual
    empleadoNombre: empNombre,
    numeroTransferencia: formData.pagoObj.numeroTransferencia || ""
  };

  console.log("Venta a registrar:", venta);

  // Actualizar stock mediante batch
  const batch = writeBatch(db);
  for (let item of cart) {
    let prodRef = doc(db, "productos", item.productId);
    let prodSnap = await getDoc(prodRef);
    if (prodSnap.exists()) {
      let prodData = prodSnap.data();
      if (prodData.stock && typeof prodData.stock === "object") {
        let stActual = prodData.stock[window.currentStore] || 0;
        prodData.stock[window.currentStore] = stActual - item.cantidad;
      } else {
        prodData.stock = (prodData.stock || 0) - item.cantidad;
      }
      batch.update(prodRef, { stock: prodData.stock });
    }
  }
  let ventaRef = doc(collection(db, "ventas"));
  batch.set(ventaRef, venta);
  try {
    await batch.commit();
    Swal.fire({
      title: "Venta procesada!",
      html: `<p>Comprobante generado.</p>
             <button class='btn btn-primary btn-sm' onclick='window.descargarComprobante(${JSON.stringify(venta)})'>
               Descargar Comprobante
             </button>`,
      icon: "success"
    });
    cart = [];
    renderCart();
  } catch (error) {
    console.error("Error en batch.commit():", error);
    Swal.fire("Error", error.toString(), "error");
  }
}

// Exponer funciones globalmente para uso en HTML u otros módulos
window.procesarVenta = procesarVenta;
window.agregarProductoAlCarrito = agregarProductoAlCarrito;
window.renderCart = renderCart;
window.listenProducts = listenProducts;

document.addEventListener("DOMContentLoaded", () => {
  listenProducts();
});

// Función para descargar el comprobante de venta (se descarga como HTML si se desea, este ejemplo lo deja igual)
window.descargarComprobante = function(venta) {
  let comprobanteHtml = `
    <h2>Comprobante de Venta</h2>
    <p><strong>ID Venta:</strong> ${venta.idVenta}</p>
    <p><strong>Fecha:</strong> ${new Date(venta.fecha).toLocaleString()}</p>
    <p><strong>Empleado:</strong> ${venta.empleadoNombre}</p>
    <p><strong>Cliente:</strong> ${venta.cliente.nombre}</p>
    <hr>
    <h3>Detalle de Productos</h3>
    <ul>
      ${venta.productos.map(prod => `<li>${prod.producto_nombre} (${prod.producto_codigo}) - Cant: ${prod.cantidad} x Q${prod.precio_unitario.toFixed(2)} = Q${prod.subtotal.toFixed(2)}</li>`).join('')}
    </ul>
    <hr>
    <p><strong>Total:</strong> Q${venta.total.toFixed(2)}</p>
  `;
  let blob = new Blob([comprobanteHtml], { type: "text/html" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = `comprobante-venta-${venta.idVenta}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

document.addEventListener("DOMContentLoaded", () => {
  const storeSelect = document.getElementById("storeSelect");
  if (storeSelect) {
    storeSelect.addEventListener("change", renderProducts);
  }
  listenProducts();
});
