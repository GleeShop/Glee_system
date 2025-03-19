import { db } from "./firebase-config.js";
import {
        getFirestore,
        collection,
        query,
        orderBy,
        getDocs,
        onSnapshot,
        where,
        doc,
        updateDoc,
        deleteDoc,
        getDoc
      } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
      
      // Variables globales
      let tablaVentas;
      const loggedUserRole = (localStorage.getItem("loggedUserRole") || "").toLowerCase();
      const loggedUser = localStorage.getItem("loggedUser") || "";
  
      $(document).ready(function () {
        tablaVentas = $("#ventasTable").DataTable({
          language: {
            url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json"
          },
          columns: [
            { title: "Id Venta" },
            { title: "Fecha" },
            { title: "Cliente" },
            { title: "Vendedor" },
            { title: "Monto Total" },
            { title: "Método de pago" },
            { title: "Estado" },
            { title: "Acciones", orderable: false }
          ],
          order: [[1, "desc"]],
          responsive: true
        });
        cargarVentas();
  
        // Evento para filtrar por fecha
        $("#filtroFecha").on("change", cargarVentas);
      });
  
      // Función para cargar ventas desde Firestore
      function cargarVentas() {
        const ventasQuery = query(collection(db, "ventas"), orderBy("fecha", "desc"));
        onSnapshot(ventasQuery, (snapshot) => {
          tablaVentas.clear();
          snapshot.forEach((docSnap) => {
            let venta = docSnap.data();
            // Mostrar el campo "idVenta" como número entero si existe, sino usa el doc ID
            let idVentaMostrar = venta.idVenta ? Number(venta.idVenta) : docSnap.id;
            // Mostrar el nombre del empleado que realizó la venta; si no existe, se muestra "N/A"
            const empleado = venta.empleadoNombre ? venta.empleadoNombre : "N/A";
            let acciones = `<button class="btn btn-sm btn-info" onclick="verVenta('${docSnap.id}')">VER</button>`;
            if (loggedUserRole === "admin") {
              acciones += ` <button class="btn btn-sm btn-warning" onclick="anularVenta('${docSnap.id}')">ANULAR</button>`;
              acciones += ` <button class="btn btn-sm btn-danger" onclick="eliminarVenta('${docSnap.id}')">ELIMINAR</button>`;
            }
            tablaVentas.row.add([
              idVentaMostrar,
              new Date(venta.fecha).toLocaleString(),
              venta.cliente.nombre,
              empleado,
              "Q" + Number(venta.total).toFixed(2),
              venta.metodo_pago,
              venta.estado ? venta.estado : "COMPLETADA",
              acciones
            ]);
          });
          tablaVentas.draw();
        });
      }
  
      // Función para ver el detalle de la venta y descargar el ticket en PDF
      window.verVenta = async function (idVenta) {
        try {
          const ventaDoc = doc(db, "ventas", idVenta);
          const docSnap = await getDoc(ventaDoc);
          if (docSnap.exists()) {
            let venta = docSnap.data();
            venta.id = idVenta;
            Swal.fire({
              title: "Comprobante de Venta",
              html: `
                <div>
                  <p><strong>ID:</strong> ${venta.idVenta ? Number(venta.idVenta) : venta.id}</p>
                  <p><strong>Fecha:</strong> ${new Date(venta.fecha).toLocaleString()}</p>
                  <p><strong>Cliente:</strong> ${venta.cliente.nombre}</p>
                  <p><strong>Empleado:</strong> ${venta.empleadoNombre ? venta.empleadoNombre : "N/A"}</p>
                  <p><strong>Total:</strong> Q${Number(venta.total).toFixed(2)}</p>
                  <p><strong>Método de Pago:</strong> ${venta.metodo_pago}</p>
                  <p><strong>Estado:</strong> ${venta.estado ? venta.estado : "COMPLETADA"}</p>
                  <button class='btn btn-sm btn-primary' onclick='descargarComprobante("${encodeURIComponent(JSON.stringify(venta))}")'>
                    Descargar Ticket
                  </button>
                </div>
              `,
              showConfirmButton: true
            });
          }
        } catch (error) {
          Swal.fire("Error", error.toString(), "error");
        }
      };
  
      // Función para anular venta (solo admin)
      window.anularVenta = function (idVenta) {
        if (loggedUserRole !== "admin") {
          Swal.fire("Acceso Denegado", "No tienes permiso para anular ventas.", "error");
          return;
        }
        const ventaDoc = doc(db, "ventas", idVenta);
        getDoc(ventaDoc).then((docSnap) => {
          if (docSnap.exists()) {
            let venta = docSnap.data();
            if (venta.estado && venta.estado.toUpperCase() === "ANULADA") {
              Swal.fire("LA VENTA YA ESTÁ ANULADA", "", "info");
              return;
            }
            Swal.fire({
              title: "¿ANULAR VENTA?",
              text: "Esta acción marcará la venta como anulada.",
              icon: "warning",
              showCancelButton: true,
              confirmButtonText: "SÍ, ANULAR"
            }).then((result) => {
              if (result.isConfirmed) {
                updateDoc(ventaDoc, { estado: "ANULADA" }).then(() => {
                  Swal.fire("VENTA ANULADA", "", "success");
                });
              }
            });
          }
        });
      };
  
      // Función para eliminar venta (solo admin)
      window.eliminarVenta = function (idVenta) {
        if (loggedUserRole !== "admin") {
          Swal.fire("Acceso Denegado", "No tienes permiso para eliminar ventas.", "error");
          return;
        }
        Swal.fire({
          title: "¿ELIMINAR VENTA?",
          text: "Esta acción eliminará la venta permanentemente.",
          icon: "error",
          showCancelButton: true,
          confirmButtonText: "SÍ, ELIMINAR"
        }).then((result) => {
          if (result.isConfirmed) {
            deleteDoc(doc(db, "ventas", idVenta))
              .then(() => {
                Swal.fire("VENTA ELIMINADA", "", "success");
              })
              .catch((error) => {
                Swal.fire("ERROR", error.toString(), "error");
              });
          }
        });
      };
  
      // Función para descargar y visualizar el ticket de venta en PDF con detalle de productos vendidos
      window.descargarComprobante = function (ventaEncoded) {
        const venta = JSON.parse(decodeURIComponent(ventaEncoded));
        const { jsPDF } = window.jspdf;
        // Crear un PDF tipo ticket (formato reducido: 80 x 300 mm)
        const doc = new jsPDF({
          orientation: "p",
          unit: "mm",
          format: [80, 300]
        });
        let y = 5;
        const lineHeight = 5;
        // Encabezado del ticket
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.text("TICKET DE VENTA", 40, y, { align: "center" });
        y += lineHeight * 2;
        // Datos básicos de la venta
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`ID: ${venta.idVenta ? Number(venta.idVenta) : venta.id}`, 5, y);
        y += lineHeight;
        doc.text(`Fecha: ${new Date(venta.fecha).toLocaleString()}`, 5, y);
        y += lineHeight;
        doc.text(`Cliente: ${venta.cliente.nombre}`, 5, y);
        y += lineHeight;
        doc.text(`Empleado: ${venta.empleadoNombre ? venta.empleadoNombre : "N/A"}`, 5, y);
        y += lineHeight;
        doc.text(`Total: Q${Number(venta.total).toFixed(2)}`, 5, y);
        y += lineHeight;
        doc.text(`Pago: ${venta.metodo_pago}`, 5, y);
        y += lineHeight * 2;
        // Detalle de productos vendidos
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text("PRODUCTOS:", 5, y);
        y += lineHeight;
        doc.setFont("Helvetica", "normal");
        venta.productos.forEach((prod, index) => {
          if (y > 280) {
            doc.addPage();
            y = 5;
          }
          doc.text(`${index + 1}. ${prod.producto_nombre}`, 5, y);
          y += lineHeight;
          doc.text(`Cant: ${prod.cantidad} x Q${Number(prod.precio_unitario || 0).toFixed(2)} = Q${Number(prod.subtotal || 0).toFixed(2)}`, 5, y);
          y += lineHeight;
        });
        y += lineHeight;
        doc.setFont("Helvetica", "bold");
        doc.text("¡GRACIAS POR SU COMPRA!", 40, y, { align: "center" });
        doc.output("dataurlnewwindow");
        doc.save("ticket.pdf");
      };