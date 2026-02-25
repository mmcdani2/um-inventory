export async function mountAdmin() {
  const btn = document.getElementById("btnResetDb");
  const msg = document.getElementById("adminMsg");

  const setMsg = (t, err = false) => {
    if (!msg) return;
    msg.textContent = t || "";
    msg.classList.toggle("err", !!err);
  };

  if (!btn) return;

  btn.addEventListener("click", async () => {
    setMsg("");
    const ok = confirm("Wipe local database and restart? This cannot be undone.");
    if (!ok) return;

    try {
      await window.api.dbReset();
      setMsg("Reset requested…");
    } catch (e) {
      setMsg(e?.message || "Reset failed.", true);
    }
  });
}