export async function mountCounts () {
  const msg = document.getElementById('kMsg')
  const hint = document.getElementById('kHint')
  const queueHint = document.getElementById('kQueueHint')
  const queueView = document.getElementById('kQueueView')
  const entryView = document.getElementById('kEntryView')
  const activeAreaFooter = document.getElementById('kActiveAreaFooter')

  const btnBuildCounts = document.getElementById('kBuildCounts')
  const btnReorderCounts = document.getElementById('kReorderCounts')
  const btnPrintSheets = document.getElementById('kPrintSheets')
  const btnStartCount = document.getElementById('kStartCount')
  const btnFinalizeCounts = document.getElementById('kFinalizeCounts')
  const btnBackToQueue = document.getElementById('kBackToQueue')
  const btnSave = document.getElementById('kSave')

  const queueBody = document.getElementById('kQueueBody')
  const tbody = document.querySelector('#kTable tbody')

  const kBuildModal = document.getElementById('kBuildModal')
  const kBuildModalClose = document.getElementById('kBuildModalClose')
  const kBuildSearch = document.getElementById('kBuildSearch')
  const kBuildSelectAll = document.getElementById('kBuildSelectAll')
  const kBuildBody = document.getElementById('kBuildBody')
  const kBuildApply = document.getElementById('kBuildApply')

  const kReorderModal = document.getElementById('kReorderModal')
  const kReorderModalClose = document.getElementById('kReorderModalClose')
  const kReorderBody = document.getElementById('kReorderBody')
  const kReorderDone = document.getElementById('kReorderDone')

  const missing = []
  for (const [id, el] of [
    ['kMsg', msg],
    ['kHint', hint],
    ['kQueueHint', queueHint],
    ['kQueueView', queueView],
    ['kEntryView', entryView],
    ['kActiveAreaFooter', activeAreaFooter],
    ['kBuildCounts', btnBuildCounts],
    ['kReorderCounts', btnReorderCounts],
    ['kPrintSheets', btnPrintSheets],
    ['kStartCount', btnStartCount],
    ['kFinalizeCounts', btnFinalizeCounts],
    ['kBackToQueue', btnBackToQueue],
    ['kSave', btnSave],
    ['kQueueBody', queueBody],
    ['#kTable tbody', tbody],
    ['kBuildModal', kBuildModal],
    ['kBuildModalClose', kBuildModalClose],
    ['kBuildSearch', kBuildSearch],
    ['kBuildSelectAll', kBuildSelectAll],
    ['kBuildBody', kBuildBody],
    ['kBuildApply', kBuildApply],
    ['kReorderModal', kReorderModal],
    ['kReorderModalClose', kReorderModalClose],
    ['kReorderBody', kReorderBody],
    ['kReorderDone', kReorderDone]
  ]) {
    if (!el) missing.push(id)
  }
  if (missing.length) throw new Error(`Counts page missing: ${missing.join(', ')}`)

  let locations = []
  let items = []
  let onhandRows = []

  let queue = []
  let activeAreaCode = null
  let buildSelectedIds = new Set()
  let draggedQueueCode = null

  function setMsg (text, err = false) {
    msg.textContent = text || ''
    msg.classList.toggle('err', !!err)
  }

  function escapeHtml (s) {
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

  function itemBySkuMap () {
    return new Map(items.map(i => [String(i.sku), i]))
  }

  function locByCodeMap () {
    return new Map(locations.map(l => [String(l.code), l]))
  }

  function clearEntryTable () {
    tbody.innerHTML = ''
    btnSave.disabled = true
  }

  function showQueueView () {
    queueView.classList.remove('hidden')
    entryView.classList.add('hidden')
  }

  function showEntryView () {
    queueView.classList.add('hidden')
    entryView.classList.remove('hidden')
  }

  function getQueueArea (code) {
    return queue.find(q => q.code === code) || null
  }

  function syncButtons () {
    const hasQueue = queue.length > 0
    const hasActiveRows = !!tbody.querySelector('tr')

    btnReorderCounts.disabled = !hasQueue
    btnPrintSheets.disabled = !hasQueue
    btnStartCount.disabled = !hasQueue
    btnFinalizeCounts.disabled = !hasQueue
    btnSave.disabled = !hasActiveRows
  }

  function renderQueue () {
    if (!queue.length) {
      queueBody.innerHTML = `
        <tr>
          <td colspan="3" class="hint">No count queue built yet.</td>
        </tr>
      `
      queueHint.textContent = 'No areas selected yet.'
      activeAreaFooter.textContent = 'No active area'
      activeAreaCode = null
      clearEntryTable()
      showQueueView()
      syncButtons()
      return
    }

    queueBody.innerHTML = queue
      .map((area, idx) => {
        const isActive = area.code === activeAreaCode
        const status = isActive ? 'Active' : (area.status || 'Queued')
        return `
          <tr data-queue-row="${escapeHtml(area.code)}">
            <td>${idx + 1}</td>
            <td>
              <button
                class="btn btn-ghost"
                type="button"
                data-load-queue="${escapeHtml(area.code)}"
                style="width: 100%; text-align: left; justify-content: flex-start;"
              >
                ${escapeHtml(area.label)}
              </button>
            </td>
            <td>${escapeHtml(status)}</td>
          </tr>
        `
      })
      .join('')

    queueHint.textContent = `${queue.length} area(s) in queue.`
    activeAreaFooter.textContent = activeAreaCode
      ? `Active area: ${getQueueArea(activeAreaCode)?.label || activeAreaCode}`
      : 'No active area'

    syncButtons()
  }

  function openBuildModal () {
    buildSelectedIds = new Set(queue.map(q => Number(q.id)))
    kBuildSearch.value = ''
    renderBuildRows('')
    kBuildModal.classList.remove('hidden')
    kBuildModal.setAttribute('aria-hidden', 'false')
    kBuildSearch.focus()
  }

  function closeBuildModal () {
    kBuildModal.classList.add('hidden')
    kBuildModal.setAttribute('aria-hidden', 'true')
  }

  function renderBuildRows (filter = '') {
    const q = String(filter || '').trim().toLowerCase()

    const rows = locations
      .slice()
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
      .filter(loc => {
        if (!q) return true
        const hay = `${loc.code || ''} ${loc.name || ''}`.toLowerCase()
        return hay.includes(q)
      })

    if (!rows.length) {
      kBuildBody.innerHTML = `
        <tr>
          <td colspan="2" class="hint">No areas found.</td>
        </tr>
      `
      return
    }

    kBuildBody.innerHTML = rows
      .map(loc => {
        const checked = buildSelectedIds.has(Number(loc.id)) ? 'checked' : ''
        const label = loc.name ? `${loc.code} — ${loc.name}` : loc.code
        return `
          <tr>
            <td><input type="checkbox" data-build-pick="${loc.id}" ${checked} /></td>
            <td>${escapeHtml(label)}</td>
          </tr>
        `
      })
      .join('')
  }

  function openReorderModal () {
    renderReorderRows()
    kReorderModal.classList.remove('hidden')
    kReorderModal.setAttribute('aria-hidden', 'false')
  }

  function closeReorderModal () {
    kReorderModal.classList.add('hidden')
    kReorderModal.setAttribute('aria-hidden', 'true')
  }

  function renderReorderRows () {
    if (!queue.length) {
      kReorderBody.innerHTML = `
        <tr>
          <td colspan="3" class="hint">No areas in queue.</td>
        </tr>
      `
      return
    }

    kReorderBody.innerHTML = queue
      .map((area, idx) => `
        <tr data-reorder-code="${escapeHtml(area.code)}" draggable="true">
          <td>${idx + 1}</td>
          <td>${escapeHtml(area.label)}</td>
          <td class="hint">Drag to reorder</td>
        </tr>
      `)
      .join('')
  }

  function reorderQueue (fromCode, toCode) {
    if (!fromCode || !toCode || fromCode === toCode) return

    const fromIdx = queue.findIndex(q => q.code === fromCode)
    const toIdx = queue.findIndex(q => q.code === toCode)
    if (fromIdx === -1 || toIdx === -1) return

    const [moved] = queue.splice(fromIdx, 1)
    queue.splice(toIdx, 0, moved)

    renderReorderRows()
    renderQueue()
  }

  function buildQueueFromSelectedIds () {
    const selected = locations
      .filter(loc => buildSelectedIds.has(Number(loc.id)))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))

    const oldByCode = new Map(queue.map(q => [q.code, q]))

    queue = selected.map(loc => {
      const code = String(loc.code || '')
      const existing = oldByCode.get(code)
      return {
        id: loc.id,
        code,
        label: loc.name ? `${loc.code} — ${loc.name}` : loc.code,
        status: existing?.status || 'Queued'
      }
    })

    if (activeAreaCode && !queue.some(q => q.code === activeAreaCode)) {
      activeAreaCode = null
      clearEntryTable()
      hint.textContent = 'Active area loaded for counting.'
      showQueueView()
    }

    renderQueue()
  }

  function rowsForAreaCode (areaCode) {
    const locByCode = locByCodeMap()
    const itemBySku = itemBySkuMap()
    const loc = locByCode.get(String(areaCode || ''))
    if (!loc) return []

    return onhandRows
      .filter(r => String(r.location_code || '') === String(areaCode))
      .map(r => ({
        sku: String(r.sku || ''),
        expected: Number(r.on_hand || 0),
        item: itemBySku.get(String(r.sku || '')),
        location: loc
      }))
      .filter(r => r.item)
      .sort((a, b) => {
        const aCat = String(a.item.category || '').toLowerCase()
        const bCat = String(b.item.category || '').toLowerCase()
        if (aCat !== bCat) return aCat.localeCompare(bCat)
        return String(a.item.sku || '').localeCompare(String(b.item.sku || ''))
      })
  }

  function rowHtml (item, expected, locationCode) {
    return `
      <tr data-sku="${escapeHtml(item.sku)}" data-theo="${expected}" data-location-code="${escapeHtml(locationCode)}">
        <td>${escapeHtml(locationCode)}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td class="mono">${escapeHtml(item.sku || '')}</td>
        <td>${escapeHtml(item.description || '')}</td>
        <td class="right mono">${expected}</td>
        <td class="right">
          <input class="input input-mini" data-actual="1" type="number" step="0.01" />
        </td>
        <td class="right mono" data-variance>0</td>
        <td>${escapeHtml(item.unit || '')}</td>
      </tr>
    `
  }

  function bindVarianceInputs () {
    tbody.querySelectorAll('input[data-actual]').forEach(inp => {
      inp.addEventListener('input', () => {
        const tr = inp.closest('tr')
        const theo = Number(tr?.dataset.theo || 0)
        const act = Number(inp.value || 0)
        const cell = tr?.querySelector('[data-variance]')
        if (cell) cell.textContent = String(act - theo)
      })
    })
  }

  function loadAreaIntoEntry (areaCode) {
    const area = getQueueArea(areaCode)
    if (!area) return setMsg('Area not found in queue.', true)

    const rows = rowsForAreaCode(area.code)
    activeAreaCode = area.code

    tbody.innerHTML = rows.map(r => rowHtml(r.item, r.expected, r.location.code)).join('')
    bindVarianceInputs()

    hint.textContent = rows.length
      ? `Loaded ${rows.length} row(s) for ${area.label}.`
      : `No inventory found for ${area.label}.`

    queue = queue.map(q => ({
      ...q,
      status:
        q.code === area.code
          ? 'In Progress'
          : q.status === 'In Progress'
            ? 'Queued'
            : q.status
    }))

    activeAreaFooter.textContent = `Active area: ${area.label}`
    renderQueue()
    showEntryView()
    syncButtons()

    const firstInput = tbody.querySelector('input[data-actual]')
    firstInput?.focus()
  }

  async function printQueueSheets () {
    setMsg('')
    if (!queue.length) return setMsg('Build the count queue first.', true)

    const sections = queue
      .map(area => {
        const rows = rowsForAreaCode(area.code)
        return `
          <div class="sheet">
            <h2>${escapeHtml(area.label)}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 18%;">Location</th>
                  <th style="width: 18%;">SKU</th>
                  <th>Description</th>
                  <th style="width: 8%;">UoM</th>
                  <th style="width: 10%;">Expected</th>
                  <th style="width: 16%;">Counted Qty</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${escapeHtml(r.location.code)}</td>
                    <td>${escapeHtml(r.item.sku || '')}</td>
                    <td>${escapeHtml(r.item.description || '')}</td>
                    <td>${escapeHtml(r.item.unit || '')}</td>
                    <td class="right">${r.expected}</td>
                    <td class="qty"></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
      })
      .join('')

    const w = window.open('', '_blank', 'width=1200,height=900')
    if (!w) return setMsg('Popup blocked. Allow popups and try again.', true)

    w.document.write(`
      <html>
        <head>
          <title>Inventory Count Sheets</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 12px; font-size: 24px; }
            h2 { margin: 0 0 10px; font-size: 18px; }
            .meta { margin: 0 0 18px; font-size: 12px; color: #444; }
            .sheet { page-break-after: always; margin-bottom: 28px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #222; padding: 8px; font-size: 12px; vertical-align: top; }
            th { background: #f3f3f3; text-align: left; }
            .qty { height: 28px; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h1>Inventory Count Sheets</h1>
          <div class="meta">Queue: ${escapeHtml(queue.map(q => q.code).join(', '))}</div>
          ${sections}
        </body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  async function saveCountsForActiveArea () {
    setMsg('')

    if (!activeAreaCode) return setMsg('Start a count first.', true)

    const trs = Array.from(tbody.querySelectorAll('tr'))
    if (!trs.length) return setMsg('No active count rows loaded.', true)

    const itemsNow = await window.api.itemsList()
    const itemIdBySku = new Map(itemsNow.map(i => [String(i.sku), i.id]))
    const loc = locByCodeMap().get(String(activeAreaCode || ''))

    if (!loc) return setMsg('Active area not found.', true)

    const toSave = []

    for (const tr of trs) {
      const inp = tr.querySelector('input[data-actual]')
      const raw = String(inp?.value ?? '').trim()
      if (raw === '') continue

      const actual = Number(raw)
      if (!Number.isFinite(actual) || actual < 0) {
        inp?.classList.add('bad')
        return setMsg('Counted qty must be a number >= 0.', true)
      }

      inp?.classList.remove('bad')

      const sku = String(tr.dataset.sku || '')
      const item_id = itemIdBySku.get(sku)
      if (!item_id) continue

      toSave.push({
        item_id,
        location_id: Number(loc.id),
        actual_qty: actual
      })
    }

    if (!toSave.length) return setMsg('Nothing to save. Enter at least one count.', true)

    btnSave.disabled = true
    try {
      for (const row of toSave) {
        await window.api.countsSubmit({
          user_initials: 'ADMIN',
          location_id: row.location_id,
          item_id: row.item_id,
          actual_qty: row.actual_qty,
          notes: `Count queue area ${activeAreaCode}`
        })
      }

      queue = queue.map(q => ({
        ...q,
        status: q.code === activeAreaCode ? 'Counted' : q.status
      }))

      setMsg(`Saved ${toSave.length} count(s) for ${activeAreaCode}.`)
      renderQueue()
      showQueueView()
      window.dispatchEvent(new CustomEvent('data:changed'))
    } catch (e) {
      setMsg(e?.message || 'Failed saving counts.', true)
    } finally {
      btnSave.disabled = false
    }
  }

  async function loadData () {
    ;[locations, items, onhandRows] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
      window.api.reportsOnHand()
    ])
    renderQueue()
    showQueueView()
    hint.textContent = 'Active area loaded for counting.'
  }

  btnBuildCounts.addEventListener('click', openBuildModal)
  kBuildModalClose.addEventListener('click', closeBuildModal)
  kBuildModal.addEventListener('click', e => {
    if (e.target === kBuildModal) closeBuildModal()
  })
  kBuildSearch.addEventListener('input', () => renderBuildRows(kBuildSearch.value))
  kBuildSelectAll.addEventListener('click', () => {
    buildSelectedIds = new Set(locations.map(loc => Number(loc.id)))
    renderBuildRows(kBuildSearch.value)
  })
  kBuildBody.addEventListener('change', e => {
    const pick = e.target.closest('[data-build-pick]')
    if (!pick) return
    const id = Number(pick.dataset.buildPick || 0)
    if (!id) return
    if (pick.checked) buildSelectedIds.add(id)
    else buildSelectedIds.delete(id)
  })
  kBuildApply.addEventListener('click', () => {
    buildQueueFromSelectedIds()
    closeBuildModal()
    setMsg(queue.length ? `Built queue with ${queue.length} area(s).` : 'No areas selected.')
  })

  btnReorderCounts.addEventListener('click', openReorderModal)
  kReorderModalClose.addEventListener('click', closeReorderModal)
  kReorderModal.addEventListener('click', e => {
    if (e.target === kReorderModal) closeReorderModal()
  })
  kReorderDone.addEventListener('click', () => {
    closeReorderModal()
    renderQueue()
    setMsg('Count queue reordered.')
  })

  kReorderBody.addEventListener('dragstart', e => {
    const row = e.target.closest('[data-reorder-code]')
    if (!row) return
    draggedQueueCode = String(row.dataset.reorderCode || '')
  })
  kReorderBody.addEventListener('dragover', e => {
    const row = e.target.closest('[data-reorder-code]')
    if (!row) return
    e.preventDefault()
  })
  kReorderBody.addEventListener('drop', e => {
    const row = e.target.closest('[data-reorder-code]')
    if (!row) return
    e.preventDefault()
    reorderQueue(draggedQueueCode, String(row.dataset.reorderCode || ''))
    draggedQueueCode = null
  })
  kReorderBody.addEventListener('dragend', () => {
    draggedQueueCode = null
  })

  queueBody.addEventListener('click', e => {
    const btn = e.target.closest('[data-load-queue]')
    if (!btn) return
    loadAreaIntoEntry(String(btn.dataset.loadQueue || ''))
  })

  btnStartCount.addEventListener('click', () => {
    if (!queue.length) return setMsg('Build the count queue first.', true)
    loadAreaIntoEntry(queue[0].code)
  })

  btnBackToQueue.addEventListener('click', () => {
    showQueueView()
    renderQueue()
  })

  btnPrintSheets.addEventListener('click', printQueueSheets)
  btnSave.addEventListener('click', saveCountsForActiveArea)

  btnFinalizeCounts.addEventListener('click', () => {
    if (!queue.length) return setMsg('Nothing to finalize.', true)
    const counted = queue.filter(q => q.status === 'Counted').length
    setMsg(`Finalize step not wired yet. ${counted} of ${queue.length} area(s) counted.`)
  })

  await loadData()
}