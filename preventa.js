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

// Variables para paginación en el listado de productos en ventas
let currentPageSales = 1;
let pageSizeSales = 5;

// Inicialización global de tienda (al inicio del script)
const usuarioActual = localStorage.getItem("loggedUser") || "admin";
const loggedUserRole = localStorage.getItem("loggedUserRole") || "";
let currentStore = localStorage.getItem("loggedUserStore") || window.currentStore || "";
window.currentStore = currentStore;

// Si el usuario no es Admin, asigna automáticamente la tienda asociada.
if (loggedUserRole.toLowerCase() !== "admin") {
  currentStore = localStorage.getItem("loggedUserStore") || currentStore;
  window.currentStore = currentStore;
}

// Validar tienda al cargar la página
if (loggedUserRole.toLowerCase() !== "admin" && (!currentStore || currentStore.trim() === "")) {
  Swal.fire("Error", "Tu usuario no tiene una tienda asignada. Contacta al administrador.", "error");
}

/**
 * Función para renderizar el carrito de compras
 */
export function renderCart() {
  const tbody = document.querySelector("#cartTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let total = 0;
  cart.forEach((item, idx) => {
    let subtotal = item.cantidad * item.precio;
    total += subtotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.producto}<br><small>${item.producto_codigo}</small></td>
      <td>${item.cantidad}</td>
      <td>Q ${item.precio.toFixed(2)}</td>
      <td>Q ${subtotal.toFixed(2)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeFromCart(${idx})">❌</button></td>
    `;
    tbody.appendChild(tr);
  });
  const totalVentaEl = document.getElementById("totalVenta");
  if (totalVentaEl) {
    totalVentaEl.textContent = total.toFixed(2);
  }
}

window.renderCart = renderCart;

/**
 * Función para agregar una preventa al carrito
 */
window.addPreventaToCartWithAmount = async function(preventaId, montoAPagar) {
  console.log("Agregando preventa:", preventaId, "Monto:", montoAPagar);
  try {
    const preventaDocRef = doc(db, "ventas", preventaId);
    const preventaSnap = await getDoc(preventaDocRef);
    if (!preventaSnap.exists()) {
      Swal.fire("Error", "Preventa no encontrada", "error");
      return;
    }
    const preventaData = preventaSnap.data();
    const nuevaVenta = {
      idPreventa: preventaId,
      productos: preventaData.productos,
      montoAPagar,
      totalPreventa: preventaData.total,
      saldoPendiente: preventaData.saldo_pendiente !== undefined
                        ? preventaData.saldo_pendiente
                        : (preventaData.total - (preventaData.montoAbono || 0)),
      fecha: new Date().toISOString()
    };
    cart.push(nuevaVenta);
    Swal.fire("Agregado al Carrito", "La preventa se agregó al carrito.", "success");
    renderCart();
  } catch (error) {
    console.error("Error al agregar preventa al carrito:", error);
    Swal.fire("Error", "No se pudo agregar la preventa al carrito.", "error");
  }
};

/**
 * Lógica del evento submit del formulario del modal "pagoModal"
 */
document.getElementById("pagoFinalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const montoAPagar = parseFloat(document.getElementById("monto_pago_final").value);
  if (isNaN(montoAPagar) || montoAPagar <= 0) {
    Swal.fire("Error", "Ingrese un monto válido", "error");
    return;
  }
  const preventaId = window.currentPreventaId;
  if (!preventaId) {
    Swal.fire("Error", "No se encontró la preventa seleccionada.", "error");
    return;
  }
  addPreventaToCartWithAmount(preventaId, montoAPagar);
  const modalEl = document.getElementById("pagoModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.hide();
});
