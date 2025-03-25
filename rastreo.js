import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  where
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

  cargarVentas();

  $("#filtroFecha").on("change", cargarVentas);
});

function cargarVentas() {
  const ventasRef = collection(db, "ventas");

  let condiciones = [orderBy("fecha", "desc")];

  condiciones.push(where("tipoVenta", "==", "online"));

  if (!isAdmin) {
    condiciones.push(where("usuario", "==", loggedUser));
  }

  const q = query(ventasRef, ...condiciones);

  onSnapshot(q, (snapshot) => {
    let ventasEnLinea = [];

    snapshot.forEach((docSnap) => {
      let venta = docSnap.data();
      ventasEnLinea.push({ id: docSnap.id, ...venta });
    });

    const filas = ventasEnLinea.map((venta) => {
      let idVentaMostrar = venta.idVenta ? Number(venta.idVenta) : venta.id;
      const fechaVenta = venta.fecha ? new Date(venta.fecha).toLocaleString() : "";
      const clienteDisplay = venta.cliente?.nombre || "";
      const empleadoDisplay = venta.empleadoNombre || "N/A";
      const metodoPagoDisplay = venta.metodo_pago || "";
      const totalVentaDisplay = venta.total ? Number(venta.total).toFixed(2) : "0.00";
      const estadoDisplay = venta.estado || "Pendiente Envío";

      let acciones = `<button class="btn btn-sm btn-info" onclick="verVenta('${venta.id}')">VER</button>`;
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

    dtInstance.clear();
    dtInstance.rows.add(filas);
    dtInstance.draw();
  }, (error) => {
    console.error("Error en onSnapshot:", error);
  });
}

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
            <p><strong>Estado:</strong> ${venta.estado || "Pendiente Envío"}</p>
          </div>
        `,
        showConfirmButton: true
      });
    }
  } catch (error) {
    Swal.fire("Error", error.toString(), "error");
  }
};

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
