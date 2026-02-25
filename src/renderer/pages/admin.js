// src/renderer/pages/admin.js
export async function mountAdmin() {
  const btnReset = document.getElementById("btnResetDb");
  const msg = document.getElementById("adminMsg");

  const locCsvFile = document.getElementById("locCsvFile");
  const locCsvName = document.getElementById("locCsvName");
  const btnImportLocCsv = document.getElementById("btnImportLocCsv");
  const adminToolsMsg = document.getElementById("adminToolsMsg");

  const setMsg = (t, err = false) => {
    if (!msg) return;
    msg.textContent = t || "";
    msg.classList.toggle("err", !!err);
  };

  const setToolsMsg = (t, err = false) => {
    if (!adminToolsMsg) return;
    adminToolsMsg.textContent = t || "";
    adminToolsMsg.classList.toggle("err", !!err);
  };

  // ---- Reset DB ----
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      setMsg("");
      const ok = confirm(
        "Wipe local database and restart? This cannot be undone.",
      );
      if (!ok) return;

      try {
        await window.api.dbReset();
        setMsg("Reset requested…");
      } catch (e) {
        setMsg(e?.message || "Reset failed.", true);
      }
    });
  }

  // ---- Locations CSV Import ----
  if (locCsvFile && locCsvName && btnImportLocCsv) {
    // initial state
    btnImportLocCsv.disabled = true;
    locCsvName.textContent = "No file selected";

    locCsvFile.addEventListener("change", () => {
      const f = locCsvFile.files && locCsvFile.files[0];
      locCsvName.textContent = f ? f.name : "No file selected";
      btnImportLocCsv.disabled = !f;
      setToolsMsg("");
    });

    btnImportLocCsv.addEventListener("click", async () => {
      setToolsMsg("");
      const f = locCsvFile.files && locCsvFile.files[0];
      if (!f) return;

      try {
        btnImportLocCsv.disabled = true;
        const csvText = await f.text();

        const res = await window.api.locationsImportCsv({ csvText });

        setToolsMsg(
          `Locations imported. Inserted: ${res?.inserted ?? 0}, Skipped: ${res?.skipped ?? 0}, Total: ${res?.total ?? 0}`,
        );

        window.dispatchEvent(new CustomEvent("data:changed"));
      } catch (e) {
        setToolsMsg(e?.message || "Locations import failed.", true);
      } finally {
        const f2 = locCsvFile.files && locCsvFile.files[0];
        btnImportLocCsv.disabled = !f2;
      }
    });
  }
}
