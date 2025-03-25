import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Variable global para almacenar la instancia de DataTable
let dtInstance;

// Datos de usuario
const loggedUserRole = (localStorage.getItem("loggedUserRole") || "").toLowerCase();
const isAdmin = loggedUserRole === "admin";

// Inicialización: espera a que el DOM esté listo y crea la DataTable solo una vez.
$(document).ready(function () {
  dtInstance = $("#ventasTable").DataTable({
    language: {
      url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json"
    },
    columns: [
      { title: "Número de Guía" },
      { title: "Id Venta" },
      { title: "Fecha" },
      { title: "Cliente" },
      { title: "Vendedor" },
      { title: "Monto Total" },
      { title: "Método de Pago" },
      { title: "Estado" },
      { title: "Acciones", orderable: false }
    ],
    order: [[2, "desc"]],
    responsive: true
  });

  cargarVentas();
  
  // Si tienes un input para filtrar (opcional)
  $("#filtroFecha").on("change", cargarVentas);
});

// Función para cargar y actualizar las ventas (filtrando manualmente ventas en línea)
function cargarVentas() {
  console.log("Ejecutando cargarVentas()...");
  const ventasRef = collection(db, "ventas");
  const q = query(ventasRef, orderBy("fecha", "desc"));
  console.log("Consulta creada:", q);

  onSnapshot(q, (snapshot) => {
    console.log("onSnapshot activado. Documentos obtenidos:", snapshot.size);
    let ventasEnLinea = [];
    snapshot.forEach((docSnap) => {
      let venta = docSnap.data();
      console.log("Venta obtenida:", venta);
      // Comparación insensible a mayúsculas para el método de pago
      if (venta.metodo_pago && venta.metodo_pago.toLowerCase() === "en línea") {
        ventasEnLinea.push({ id: docSnap.id, ...venta });
      } else {
        console.warn("Venta omitida, método:", venta.metodo_pago);
      }
    });
    console.log("Ventas en línea filtradas:", ventasEnLinea.length);

    // Crear arreglo de filas con 9 columnas, en el mismo orden que la DataTable
    const filas = ventasEnLinea.map((venta) => {
      let idVentaMostrar = venta.idVenta ? Number(venta.idVenta) : venta.id;
      // Extraer la parte de la fecha (YYYY-MM-DD) o formatear la fecha completa
      const fechaVenta = venta.fecha ? new Date(venta.fecha).toLocaleString() : "";
      const clienteDisplay = venta.cliente && typeof venta.cliente === "object" ? venta.cliente.nombre || "" : (venta.cliente || "");
      const empleadoDisplay = venta.empleadoNombre || "N/A";
      const metodoPagoDisplay = venta.metodo_pago || "";
      const totalVentaDisplay = venta.total ? Number(venta.total).toFixed(2) : "0.00";
      const estadoDisplay = venta.estado ? venta.estado : "Pendiente Envío";
      let acciones = `<button class="btn btn-sm btn-info" onclick="verVenta('${venta.id}')">VER</button>`;
      if (loggedUserRole === "admin") {
      }
      acciones += ` <button class="btn btn-sm btn-secondary" onclick="cambiarEstadoVenta('${venta.id}', '${estadoDisplay}')">CAMBIAR ESTADO</button>`;
      
      return [
        venta.guia || "",
        idVentaMostrar,
        fechaVenta,
        clienteDisplay,
        empleadoDisplay,
        "Q" + totalVentaDisplay,
        metodoPagoDisplay,
        estadoDisplay,
        acciones
      ];
    });

    // Actualizamos la DataTable sin destruir la instancia
    dtInstance.clear();
    dtInstance.rows.add(filas);
    dtInstance.draw();
  }, (error) => {
    console.error("Error en onSnapshot:", error);
  });
}

// Función para ver la venta
window.verVenta = async function (idVenta) {
  try {
    const ventaDoc = doc(db, "ventas", idVenta);
    const docSnap = await getDoc(ventaDoc);
    if (docSnap.exists()) {
      let venta = docSnap.data();
      venta.id = idVenta;
      Swal.fire({
        title: "Detalle de Venta",
        html: `
          <div>
            <p><strong>ID:</strong> ${venta.idVenta ? Number(venta.idVenta) : venta.id}</p>
            <p><strong>Fecha:</strong> ${new Date(venta.fecha).toLocaleString()}</p>
            <p><strong>Cliente:</strong> ${venta.cliente?.nombre || ""}</p>
            <p><strong>Empleado:</strong> ${venta.empleadoNombre || "N/A"}</p>
            <p><strong>Total:</strong> Q${Number(venta.total).toFixed(2)}</p>
            <p><strong>Método de Pago:</strong> ${venta.metodo_pago}</p>
            <p><strong>Estado:</strong> ${venta.estado ? venta.estado : "Pendiente Envío"}</p>
          </div>
        `,
        showConfirmButton: true
      });
    }
  } catch (error) {
    Swal.fire("Error", error.toString(), "error");
  }
};

// Función para cambiar el estado de una venta (alternar entre Pendiente Envío y Enviada)
window.cambiarEstadoVenta = function (idVenta, estadoActual) {
  const ventaDoc = doc(db, "ventas", idVenta);
  const nuevoEstado = (estadoActual === "Pendiente Envío") ? "Enviada" : "Pendiente Envío";
  Swal.fire({
    title: "¿Cambiar estado?",
    text: `El estado actual es '${estadoActual}'. Se cambiará a '${nuevoEstado}'.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, cambiar"
  }).then((result) => {
    if (result.isConfirmed) {
      updateDoc(ventaDoc, { estado: nuevoEstado }).then(() => {
        Swal.fire("Estado actualizado", `Nuevo estado: ${nuevoEstado}`, "success");
      });
    }
  });
};


