export async function mountItems () {
  const tbody = document.querySelector('#itemsTable tbody')
  const msg = document.getElementById('itemsMsg')
  const hint = document.getElementById('itemsHint')

  let items = []

  tbody.addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-edit]')
    const locBtn = e.target.closest('[data-locs]')

    if (editBtn) {
      const id = Number(editBtn.dataset.edit)
      const item = items.find(x => Number(x.id) === id)
      if (!item) return

      openModal(
        `Edit — ${item.sku}`,
        `
  <div class="edit-grid">
    <label class="field">
      <div class="lbl">Category</div>
      <input id="eCategory" class="input" value="${esc(item.category || '')}" />
    </label>

    <label class="field">
  <div class="lbl">SKU / Part #</div>
  <input id="eSku" class="input mono" value="${esc(item.sku || '')}" />
</label>

    <label class="field">
      <div class="lbl">Unit</div>
      <input id="eUnit" class="input" value="${esc(item.unit || '')}" />
    </label>

    <label class="field span-2">
      <div class="lbl">Description</div>
      <input id="eDesc" class="input" value="${esc(item.description || '')}" />
    </label>

    <label class="field span-2">
      <div class="lbl">Barcode</div>
      <input id="eBarcode" class="input mono" value="${esc(
        item.barcode || ''
      )}" />
    </label>

    <label class="field">
      <div class="lbl">Par</div>
      <input id="eRP" class="input" type="number" step="1" value="${num(
        item.reorder_point
      )}" />
    </label>

    <label class="field">
      <div class="lbl">Restock</div>
      <input id="eRQ" class="input" type="number" step="1" value="${num(
        item.reorder_qty
      )}" />
    </label>

    <label class="field">
      <div class="lbl">Cost</div>
      <input id="eCost" class="input" inputmode="decimal" value="${Number(
        item.default_cost ?? 0
      ).toFixed(2)}" />
    </label>

    <div class="msg span-2" id="eMsg"></div>
  </div>

  <div class="modal-actions">
    <button class="btn" data-close>Cancel</button>
    <button id="eSave" class="btn btn-primary">Save</button>
  </div>
`
      )

      ;[
        'eCategory',
        'eUnit',
        'eDesc',
        'eBarcode',
        'eRP',
        'eRQ',
        'eCost'
      ].forEach(id => {
        const el = document.getElementById(id)
        if (!el) return
        el.addEventListener('focus', () => el.select())
        el.addEventListener('mouseup', ev => ev.preventDefault())
      })

      const eCost = document.getElementById('eCost')
      eCost?.addEventListener('blur', () => {
        const n = Number(String(eCost.value || '').replace(/[$,]/g, ''))
        eCost.value = `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
      })
      eCost?.addEventListener('focus', () => {
        eCost.value = String(eCost.value || '').replace(/[$,]/g, '')
        eCost.select()
      })

      document.getElementById('eSave').addEventListener('click', async () => {
        const eMsg = document.getElementById('eMsg')
        eMsg.textContent = ''

        document.getElementById('eCost')?.dispatchEvent(new Event('blur'))

        try {
          await window.api.itemsUpdate({
            id,
            sku: document.getElementById('eSku').value.trim(),
            category: document.getElementById('eCategory').value,
            unit: document.getElementById('eUnit').value,
            description: document.getElementById('eDesc').value,
            barcode: document.getElementById('eBarcode').value,
            reorder_point: document.getElementById('eRP').value,
            reorder_qty: document.getElementById('eRQ').value,
            default_cost: String(
              document.getElementById('eCost').value || ''
            ).replace(/[$,]/g, '')
          })

          window.dispatchEvent(new CustomEvent('data:changed'))
          await load()
          document.getElementById('itemsModal').classList.add('hidden')
          setMsg('Saved.')
        } catch (err) {
          eMsg.textContent = err.message || 'Failed to save.'
          eMsg.classList.add('err')
        }
      })

      return
    }

    if (locBtn) {
      try {
        const sku = String(locBtn.dataset.locs || '')
        const rows = await window.api.reportsOnHand()
        const hits = rows.filter(r => String(r.sku) === sku)

        const html = hits.length
          ? `
        <div class="hint">On-hand by Area for <span class="mono">${esc(
          sku
        )}</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:140px">Area</th>
                <th>Name</th>
                <th class="right" style="width:120px">On Hand</th>
                <th style="width:180px">Updated</th>
              </tr>
            </thead>
            <tbody>
              ${hits
                .map(
                  h => `
                <tr>
                  <td class="mono">${esc(h.location_code)}</td>
                  <td>${esc(h.location_name || '')}</td>
                  <td class="right mono">${num(h.on_hand)}</td>
                  <td class="mono">${esc(h.updated_at || '')}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
          : `<div class="hint">No on-hand rows yet. This SKU has not been received into any Area.</div>`

        openModal(`Locations — ${sku}`, html)
      } catch (err) {
        setMsg(`Locations modal error: ${err?.message || err}`, true)
      }
    }
  })

  function setMsg (text, isError = false) {
    msg.textContent = text || ''
    msg.classList.toggle('err', !!isError)
  }

  function ensureModal () {
    let el = document.getElementById('itemsModal')
    if (el) return el

    el = document.createElement('div')
    el.id = 'itemsModal'
    el.className = 'modal hidden'
    el.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title" id="itemsModalTitle">Details</div>
        <button class="btn" data-close>✕</button>
      </div>
      <div class="modal-body" id="itemsModalBody"></div>
      <div class="modal-foot">
        <button class="btn" data-close>Close</button>
      </div>
    </div>
  `
    document.body.appendChild(el)

    el.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) el.classList.add('hidden')
    })

    return el
  }

  function openModal (title, html) {
    const m = ensureModal()
    m.querySelector('#itemsModalTitle').textContent = title
    m.querySelector('#itemsModalBody').innerHTML = html
    m.classList.remove('hidden')
  }

  function wireItemsSearch () {
    const input = document.getElementById('itemsSearch')
    const clear = document.getElementById('itemsSearchClear')
    if (!input || !clear || !tbody) return

    input.addEventListener('focus', () => input.select())

    const apply = () => {
      const q = input.value.trim().toLowerCase()
      const rows = tbody.querySelectorAll('tr')
      rows.forEach(tr => {
        const hay = (
          (tr.innerText || '') +
          ' ' +
          (tr.dataset.barcode || '')
        ).toLowerCase()
        tr.style.display = !q || hay.includes(q) ? '' : 'none'
      })
    }

    input.addEventListener('input', apply)
    clear.addEventListener('click', () => {
      input.value = ''
      apply()
      input.focus()
    })

    apply()
  }

  async function load () {
    items = await window.api.itemsList()
    tbody.innerHTML = items.map(i => rowHtml(i)).join('')

    if (hint) {
      hint.textContent = items.length
        ? `${items.length} item(s)`
        : 'No items yet.'
    }

    document.getElementById('itemsSearch')?.dispatchEvent(new Event('input'))
  }

  window.addEventListener('data:changed', load)

  wireItemsSearch()
  await load()
  document.getElementById('itemsSearch')?.focus()
}

function rowHtml (i) {
  return `
    <tr data-id="${i.id}" data-sku="${esc(i.sku)}" data-barcode="${esc(
    i.barcode || ''
  )}">
      <td>${esc(i.category)}</td>
      <td class="mono">${esc(i.barcode || '')}</td>
      <td class="mono">${esc(i.sku)}</td>
      <td title="${esc(i.description)}">${esc(i.description)}</td>
      <td class="c">${esc(i.unit)}</td>
      <td class="c mono">${num(i.on_hand_total)}</td>
      <td class="c mono">${num(i.reorder_point)}</td>
      <td class="c mono">${num(i.reorder_qty)}</td>
      <td class="c mono">${money(i.default_cost)}</td>
      <td class="c">
        <div class="row-actions">
          <button class="btn" data-edit="${i.id}">Edit</button>
          <button class="btn" data-locs="${esc(i.sku)}">Locations</button>
        </div>
      </td>
    </tr>
  `
}

function num (n) {
  const x = Number(n ?? 0)
  return Number.isFinite(x) ? x.toString() : '0'
}

function money (n) {
  const x = Number(n ?? 0)
  if (!Number.isFinite(x)) return '$0.00'
  return x.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function esc (s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
  )
}
