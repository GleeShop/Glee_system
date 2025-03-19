import { db } from "./firebase-config.js";
      import {
        collection,
        query,
        orderBy,
        getDocs,
        doc,
        getDoc,
        addDoc,
        updateDoc,
        deleteDoc
      } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

      let stores = [];

      /************************************************
       * 2. Función para cargar y mostrar las tiendas
       ************************************************/
      async function loadStores() {
        try {
          // Consulta la colección "tiendas", ordenada por "nombre"
          const q = query(collection(db, "tiendas"), orderBy("nombre"));
          const snapshot = await getDocs(q);

          stores = [];
          const tbody = document.querySelector("#storesTable tbody");
          tbody.innerHTML = "";

          snapshot.forEach((docSnap) => {
            const store = docSnap.data();
            store.id = docSnap.id;
            stores.push(store);

            const row = tbody.insertRow();
            row.insertCell(0).textContent = store.nombre;
            row.insertCell(1).textContent = store.direccion || "";
            row.insertCell(2).textContent = store.enabled ? "Sí" : "No";

            const cellActions = row.insertCell(3);
            cellActions.innerHTML = `
              <button
                class="btn btn-sm btn-primary me-1"
                onclick="editStore('${store.id}')"
              >
                Editar
              </button>
              <button
                class="btn btn-sm btn-warning me-1"
                onclick="toggleStore('${store.id}', ${store.enabled})"
              >
                ${store.enabled ? "Deshabilitar" : "Habilitar"}
              </button>
              <button
                class="btn btn-sm btn-danger"
                onclick="deleteStore('${store.id}')"
              >
                Eliminar
              </button>
            `;
          });
        } catch (error) {
          console.error("Error al cargar tiendas:", error);
          Swal.fire("Error", "Error al cargar tiendas: " + error.message, "error");
        }
      }

      /************************************************
       * 3. Mostrar formulario para crear nueva tienda
       ************************************************/
      function showStoreForm() {
        document.getElementById("storeForm").reset();
        document.getElementById("storeId").value = "";
        document.getElementById("storeModalLabel").textContent = "Crear Tienda";

        new bootstrap.Modal(document.getElementById("storeModal")).show();
      }

      /************************************************
       * 4. Cargar tienda en formulario para edición
       ************************************************/
      async function editStore(storeId) {
        try {
          const docRef = doc(db, "tiendas", storeId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            Swal.fire("Error", "Tienda no encontrada.", "error");
            return;
          }
          const store = docSnap.data();
          
          document.getElementById("storeId").value = storeId;
          document.getElementById("storeName").value = store.nombre;
          document.getElementById("storeAddress").value = store.direccion || "";
          document.getElementById("storeEnabled").value = store.enabled ? "true" : "false";

          document.getElementById("storeModalLabel").textContent = "Editar Tienda";
          new bootstrap.Modal(document.getElementById("storeModal")).show();
        } catch (error) {
          console.error("Error al cargar tienda:", error);
          Swal.fire("Error", "Error al cargar tienda: " + error.message, "error");
        }
      }

      /************************************************
       * 5. Eliminar tienda
       ************************************************/
      async function deleteStore(storeId) {
        if (!confirm("¿Está seguro de eliminar esta tienda?")) return;
        try {
          await deleteDoc(doc(db, "tiendas", storeId));
          Swal.fire("Éxito", "Tienda eliminada.", "success");
          loadStores();
        } catch (error) {
          console.error("Error al eliminar tienda:", error);
          Swal.fire("Error", "Error al eliminar tienda: " + error.message, "error");
        }
      }

      /************************************************
       * 6. Alternar tienda (habilitar/deshabilitar)
       ************************************************/
      async function toggleStore(storeId, currentStatus) {
        try {
          await updateDoc(doc(db, "tiendas", storeId), {
            enabled: !currentStatus
          });
          Swal.fire("Éxito", "Estado de la tienda actualizado.", "success");
          loadStores();
        } catch (error) {
          console.error("Error al actualizar estado:", error);
          Swal.fire("Error", "Error al actualizar estado: " + error.message, "error");
        }
      }

      /************************************************
       * 7. Manejo del formulario (crear/editar)
       ************************************************/
      document.getElementById("storeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const storeId = document.getElementById("storeId").value;
        const nombre = document.getElementById("storeName").value.trim();
        const direccion = document.getElementById("storeAddress").value.trim();
        const enabled = document.getElementById("storeEnabled").value === "true";

        if (!nombre) {
          Swal.fire("Error", "El nombre es obligatorio.", "error");
          return;
        }

        try {
          const storeData = { nombre, direccion, enabled };
          if (storeId) {
            // Actualizar tienda existente
            const storeRef = doc(db, "tiendas", storeId);
            await updateDoc(storeRef, storeData);
            Swal.fire("Éxito", "Tienda actualizada.", "success");
          } else {
            // Crear nueva tienda
            await addDoc(collection(db, "tiendas"), storeData);
            Swal.fire("Éxito", "Tienda creada.", "success");
          }

          // Cerrar modal y recargar tabla
          bootstrap.Modal.getInstance(document.getElementById("storeModal")).hide();
          loadStores();
        } catch (error) {
          console.error("Error al guardar tienda:", error);
          Swal.fire("Error", "Error al guardar tienda: " + error.message, "error");
        }
      });

      /************************************************
       * 8. Exponer funciones a window para uso en HTML
       ************************************************/
      window.showStoreForm = showStoreForm;
      window.editStore = editStore;
      window.deleteStore = deleteStore;
      window.toggleStore = toggleStore;

      /************************************************
       * 9. Cargar tiendas al iniciar
       ************************************************/
      document.addEventListener("DOMContentLoaded", () => {
        loadStores();
      });
  