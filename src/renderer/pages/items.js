export async function mountItems() {
  const btnRefresh = document.getElementById("itemsRefresh");
  const btnAdd = document.getElementById("itemsAdd");
  const tbody = document.querySelector("#itemsTable tbody");
  const hint = document.getElementById("itemsHint");
  const msg = document.getElementById("itemsMsg");

  const f = {
    sku: document.getElementById("fSku"),
    desc: document.getElementById("fDesc"),
    cat: document.getElementById("fCat"),
    unit: document.getElementById("fUnit"),
    vendor: document.getElementById("fVendor"),
    barcode: document.getElementById("fBarcode"),
    rop: document.getElementById("fROP"),
    roq: document.getElementById("fROQ"),
    cost: document.getElementById("fCost"),
  };

  async function load() {
    const items = await window.api.itemsList();
    tbody.innerHTML = items.map((i) => rowHtml(i)).join("");
    hint.textContent = items.length
      ? `${items.length} item(s)`
      : "No items yet.";
  }

  function setMsg(text, isError = false) {
    msg.textContent = text || "";
    msg.classList.toggle("err", !!isError);
  }

  async function addItem() {
    setMsg("");
    btnAdd.disabled = true;

    try {
      const item = {
        sku: f.sku.value,
        description: f.desc.value,
        category: f.cat.value,
        unit: f.unit.value,
        vendor: f.vendor.value,
        barcode: f.barcode.value,
        reorder_point: f.rop.value,
        reorder_qty: f.roq.value,
        default_cost: f.cost.value,
      };

      await window.api.itemsCreate(item);

      // clear minimal fields
      f.sku.value = "";
      f.desc.value = "";
      f.barcode.value = "";
      f.rop.value = "0";
      f.roq.value = "0";
      f.cost.value = "0";

      setMsg("Added.");
      await load();
      f.sku.focus();
    } catch (e) {
      setMsg(e.message || "Failed to add item.", true);
    } finally {
      btnAdd.disabled = false;
    }
  }

  btnRefresh.addEventListener("click", load);
  btnAdd.addEventListener("click", addItem);
  f.desc.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addItem();
  });

  await load();
  window.addEventListener("data:changed", load);
}

function rowHtml(i) {
  return `
    <tr>
      <td class="mono">${escapeHtml(i.sku)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.unit)}</td>
      <td>${escapeHtml(i.vendor)}</td>
      <td class="right mono">${fmtNum(i.on_hand_total)}</td>
      <td class="right mono">${fmtNum(i.reorder_point)}</td>
      <td class="right mono">${fmtNum(i.reorder_qty)}</td>
      <td class="right mono">${fmtMoney(i.default_cost)}</td>
    </tr>
  `;
}

function fmtNum(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toString() : "0";
}
function fmtMoney(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}
function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
