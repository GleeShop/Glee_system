import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  updateDoc,
  getDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

let dtInstance;
const loggedUser = localStorage.getItem("loggedUser") || "";
const loggedUserRole = (localStorage.getItem("loggedUserRole") || "").toLowerCase();
const isAdmin = loggedUserRole === "admin";

$(document).ready(function () {
  dtInstance = $("#ventasTable").DataTable({
    pageLength: 5,
    lengthMenu: [[5, 10, 25, 30], [5, 10, 25, 30]],
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

  // Inicializar filtro de fecha con la fecha actual pero sin aplicarlo automáticamente
  const today = new Date().toISOString().split('T')[0];
  $("#filtroFecha").val(today);

  cargarVentas();

  $("#filtroFecha").on("change", function () {
    console.log("Filtro de fecha cambiado a:", $("#filtroFecha").val());
    filtrarVentas();
  });
});

function cargarVentas(filterDate = "") {
  console.log("Cargando ventas con filtro de fecha:", filterDate);
  const ventasRef = collection(db, "ventas");
  let condiciones = [orderBy("fecha", "desc"), where("tipoVenta", "==", "online")];

  if (!isAdmin) {
    condiciones.push(where("usuario", "==", loggedUser));
  }

  const q = query(ventasRef, ...condiciones);

  onSnapshot(q, (snapshot) => {
    let ventasEnLinea = [];

    snapshot.forEach((docSnap) => {
      let venta = docSnap.data();
      venta.id = docSnap.id;

      let fechaVenta;
      if (venta.fecha instanceof Timestamp) {
        fechaVenta = venta.fecha.toDate().toISOString().split("T")[0];
      } else if (typeof venta.fecha === "string") {
        fechaVenta = venta.fecha.split("T")[0];
      } else {
        fechaVenta = "";
      }

      console.log("Venta procesada:", venta, "Fecha procesada:", fechaVenta);

      // Filtrar por fecha seleccionada
      if (!filterDate || fechaVenta === filterDate) {
        venta.fechaFormateada = fechaVenta ? new Date(fechaVenta).toLocaleDateString() : "";
        ventasEnLinea.push(venta);
      }
    });

    console.log("Ventas después del filtro:", ventasEnLinea);
    actualizarTabla(ventasEnLinea);
  }, (error) => {
    console.error("Error en onSnapshot:", error);
  });
}

function actualizarTabla(ventas) {
  console.log("Actualizando tabla con ventas:", ventas);
  const filas = ventas.map((venta) => {
    let idVentaMostrar = venta.idVenta ? Number(venta.idVenta) : venta.id;

    const clienteDisplay = venta.cliente?.nombre || "";
    const empleadoDisplay = venta.empleadoNombre || "N/A";
    const metodoPagoDisplay = venta.metodo_pago || "";
    const totalVentaDisplay = venta.total ? Number(venta.total).toFixed(2) : "0.00";
    const estadoDisplay = venta.estado || "Pendiente Envío";

    let acciones = `<button class="btn btn-sm btn-info" onclick="verVenta('${venta.id}')">Ver</button>`;
    acciones += ` <button class="btn btn-sm btn-secondary" onclick="cambiarEstadoVenta('${venta.id}', '${estadoDisplay}')">Enviar</button>`;

    return [
      venta.guia || "",
      idVentaMostrar,
      venta.fechaFormateada,
      clienteDisplay,
      empleadoDisplay,
      "Q" + totalVentaDisplay,
      metodoPagoDisplay,
      estadoDisplay,
      acciones
    ];
  });

  dtInstance.clear();
  dtInstance.rows.add(filas);
  dtInstance.draw();
}

function filtrarVentas() {
  const filtroFecha = $("#filtroFecha").val();
  console.log("Ejecutando filtro con fecha:", filtroFecha);
  cargarVentas(filtroFecha);
}