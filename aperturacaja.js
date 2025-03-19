// aperturacaja.js - Apertura de Caja
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

export let cajaAbierta = false;
export let idAperturaActivo = null;
export let datosApertura = {};

const usuarioActual = localStorage.getItem("loggedUser") || "admin";

/**
 * Función para cargar la apertura persistente desde localStorage, si existe.
 */
function cargarAperturaPersistente() {
  const abierta = localStorage.getItem("cajaAbierta");
  if (abierta === "true") {
    cajaAbierta = true;
    idAperturaActivo = localStorage.getItem("idAperturaActivo");
    datosApertura = JSON.parse(localStorage.getItem("datosApertura"));
    window.montoApertura = parseFloat(localStorage.getItem("montoApertura")) || 0;
    // Asignar variables globalmente para que otros módulos las usen
    window.cajaAbierta = cajaAbierta;
    window.idAperturaActivo = idAperturaActivo;
    window.datosApertura = datosApertura;
  }
}

// Ejecutar la función al cargar el módulo
cargarAperturaPersistente();

export async function getNextAperturaId() {
  try {
    const aperturasRef = collection(db, "aperturas");
    const q = query(aperturasRef, orderBy("idAperturaNum", "desc"), limit(1));
    const snapshot = await getDocs(q);
    let nextId = 1;
    if (!snapshot.empty) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        nextId = parseInt(data.idAperturaNum) + 1;
      });
    }
    return nextId;
  } catch (error) {
    console.error("Error al obtener el próximo número de apertura:", error);
    return Math.floor(Math.random() * 90000) + 10000;
  }
}

export async function abrirCaja() {
  if (cajaAbierta) {
    Swal.fire("Error", "La caja ya está abierta.", "warning");
    return;
  }
  const nextId = await getNextAperturaId();
  const { value: monto } = await Swal.fire({
    title: "Abrir Caja",
    input: "number",
    inputLabel: "Ingrese el monto inicial (Q)",
    inputValidator: (val) => !val || parseFloat(val) <= 0 ? "Monto inválido" : null
  });
  if (!monto) return;
  let now = new Date();
  let fecha = now.toISOString().split("T")[0];
  let hora = now.toTimeString().split(" ")[0];
  let apertura = {
    idAperturaNum: nextId,  // Número incremental para referencia
    fechaApertura: fecha,
    horaApertura: hora,
    montoApertura: parseFloat(monto),
    usuario: usuarioActual,
    activo: true
  };
  try {
    const docRef = await addDoc(collection(db, "aperturas"), apertura);
    cajaAbierta = true;
    idAperturaActivo = docRef.id;
    datosApertura = apertura;
    // Asignar variables globalmente
    window.cajaAbierta = cajaAbierta;
    window.idAperturaActivo = idAperturaActivo;
    window.datosApertura = datosApertura;
    window.montoApertura = apertura.montoApertura; // Guardamos el monto de apertura
    // Persistencia en localStorage
    localStorage.setItem("cajaAbierta", "true");
    localStorage.setItem("idAperturaActivo", idAperturaActivo);
    localStorage.setItem("datosApertura", JSON.stringify(datosApertura));
    localStorage.setItem("montoApertura", apertura.montoApertura.toString());
    Swal.fire("Caja Abierta", `Apertura registrada. Fondo: Q ${monto} (N° Apertura: ${nextId})`, "success");
  } catch (error) {
    Swal.fire("Error", error.message, "error");
  }
}

window.abrirCaja = abrirCaja;
