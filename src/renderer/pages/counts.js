export async function mountCounts () {
  const msg = document.getElementById('kMsg')
  const hint = document.getElementById('kHint')
  const queueHint = document.getElementById('kQueueHint')
  const queueView = document.getElementById('kQueueView')
  const entryView = document.getElementById('kEntryView')
  const activeAreaFooter = document.getElementById('kActiveAreaFooter')

  const btnBuildCounts = document.getElementById('kBuildCounts')
  const btnPrintSheets = document.getElementById('kPrintSheets')
  const btnStartCount = document.getElementById('kStartCount')
  const btnFinalizeCounts = document.getElementById('kFinalizeCounts')
  const btnBackToQueue = document.getElementById('kBackToQueue')
  const btnSave = document.getElementById('kSave')

  const queueBody = document.getElementById('kQueueBody')
  const tbody = document.querySelector('#kTable tbody')

  const kBuildModal = document.getElementById('kBuildModal')
  const kBuildModalClose = document.getElementById('kBuildModalClose')
  const kBuildScan = document.getElementById('kBuildScan')
  const kBuildSearch = document.getElementById('kBuildSearch')
  const kBuildSelectVisible = document.getElementById('kBuildSelectVisible')
  const kBuildClearVisible = document.getElementById('kBuildClearVisible')
  const kBuildBody = document.getElementById('kBuildBody')

  const kNewGroupName = document.getElementById('kNewGroupName')
  const kAddGroup = document.getElementById('kAddGroup')
  const kAddSelectedToGroup = document.getElementById('kAddSelectedToGroup')
  const kAddLooseLocations = document.getElementById('kAddLooseLocations')
  const kTargetGroup = document.getElementById('kTargetGroup')
  const kTreeBody = document.getElementById('kTreeBody')
  const kBuildApply = document.getElementById('kBuildApply')

  const missing = []
  for (const [id, el] of [
    ['kMsg', msg],
    ['kHint', hint],
    ['kQueueHint', queueHint],
    ['kQueueView', queueView],
    ['kEntryView', entryView],
    ['kActiveAreaFooter', activeAreaFooter],
    ['kBuildCounts', btnBuildCounts],
    ['kPrintSheets', btnPrintSheets],
    ['kStartCount', btnStartCount],
    ['kFinalizeCounts', btnFinalizeCounts],
    ['kBackToQueue', btnBackToQueue],
    ['kSave', btnSave],
    ['kQueueBody', queueBody],
    ['#kTable tbody', tbody],
    ['kBuildModal', kBuildModal],
    ['kBuildModalClose', kBuildModalClose],
    ['kBuildScan', kBuildScan],
    ['kBuildSearch', kBuildSearch],
    ['kBuildSelectVisible', kBuildSelectVisible],
    ['kBuildClearVisible', kBuildClearVisible],
    ['kBuildBody', kBuildBody],
    ['kNewGroupName', kNewGroupName],
    ['kAddGroup', kAddGroup],
    ['kAddSelectedToGroup', kAddSelectedToGroup],
    ['kAddLooseLocations', kAddLooseLocations],
    ['kTargetGroup', kTargetGroup],
    ['kTreeBody', kTreeBody],
    ['kBuildApply', kBuildApply]
  ]) {
    if (!el) missing.push(id)
  }
  if (missing.length) throw new Error(`Counts page missing: ${missing.join(', ')}`)

  let locations = []
  let items = []
  let onhandRows = []

  let structure = []
  let draftTree = []
  let buildSelectedIds = new Set()
  let activeLocationCode = null
  let draggedTreeKey = null

  function setMsg (text, err = false) {
    msg.textContent = text || ''
    msg.classList.toggle('err', !!err)
  }

  function escapeHtml (s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]))
  }

  function normalizeName (value) {
    return String(value || '').trim().toUpperCase()
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

  function syncButtons () {
    const hasLocations = flattenStructureLocations(structure).length > 0
    const hasRows = !!tbody.querySelector('tr')

    btnPrintSheets.disabled = !hasLocations
    btnStartCount.disabled = !hasLocations
    btnFinalizeCounts.disabled = !hasLocations
    btnSave.disabled = !hasRows
  }

  function makeGroupNode (name) {
    const clean = normalizeName(name)
    return {
      key: `group:${clean}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      type: 'group',
      name: clean,
      children: []
    }
  }

  function makeLocationNode (loc) {
    return {
      key: `location:${loc.id}`,
      type: 'location',
      id: Number(loc.id),
      code: String(loc.code || ''),
      name: loc.name ? `${loc.code} — ${loc.name}` : String(loc.code || '')
    }
  }

  function flattenStructureLocations (tree) {
    const out = []
    for (const node of tree) {
      if (node.type === 'location') out.push(node)
      if (node.type === 'group' && Array.isArray(node.children)) out.push(...node.children)
    }
    return out
  }

  function refreshTargetGroupOptions () {
    const groups = draftTree.filter(n => n.type === 'group')
    kTargetGroup.innerHTML =
      `<option value="">Select group...</option>` +
      groups.map(g => `<option value="${escapeHtml(g.key)}">${escapeHtml(g.name)}</option>`).join('')
  }

  function renderQueue () {
    if (!structure.length) {
      queueBody.innerHTML = `
        <tr>
          <td colspan="4" class="hint">No count structure built yet.</td>
        </tr>
      `
      queueHint.textContent = 'No count structure built yet.'
      activeAreaFooter.textContent = 'No active location'
      activeLocationCode = null
      clearEntryTable()
      showQueueView()
      syncButtons()
      return
    }

    const rows = []
    let idx = 1

    for (const node of structure) {
      if (node.type === 'group') {
        rows.push(`
          <tr data-structure-key="${escapeHtml(node.key)}">
            <td>${idx++}</td>
            <td>Group</td>
            <td>${escapeHtml(node.name)}</td>
            <td>Ready</td>
          </tr>
        `)

        for (const child of node.children || []) {
          const isActive = child.code === activeLocationCode
          rows.push(`
            <tr data-structure-key="${escapeHtml(child.key)}">
              <td>${idx++}</td>
              <td>Location</td>
              <td>
                <button
                  class="btn btn-ghost"
                  type="button"
                  data-load-location="${escapeHtml(child.code)}"
                  style="width: 100%; text-align: left; justify-content: flex-start;"
                >
                  ${escapeHtml(node.name)} / ${escapeHtml(child.name)}
                </button>
              </td>
              <td>${escapeHtml(isActive ? 'Active' : 'Ready')}</td>
            </tr>
          `)
        }
      } else if (node.type === 'location') {
        const isActive = node.code === activeLocationCode
        rows.push(`
          <tr data-structure-key="${escapeHtml(node.key)}">
            <td>${idx++}</td>
            <td>Location</td>
            <td>
              <button
                class="btn btn-ghost"
                type="button"
                data-load-location="${escapeHtml(node.code)}"
                style="width: 100%; text-align: left; justify-content: flex-start;"
              >
                ${escapeHtml(node.name)}
              </button>
            </td>
            <td>${escapeHtml(isActive ? 'Active' : 'Ready')}</td>
          </tr>
        `)
      }
    }

    queueBody.innerHTML = rows.join('')
    const totalLocs = flattenStructureLocations(structure).length
    queueHint.textContent = `${totalLocs} count location(s) in structure.`
    activeAreaFooter.textContent = activeLocationCode
      ? `Active location: ${activeLocationCode}`
      : 'No active location'

    syncButtons()
  }

  function visibleLocations (filter = '') {
    const q = String(filter || '').trim().toLowerCase()
    const usedIds = new Set(flattenStructureLocations(draftTree).map(n => Number(n.id)))

    return locations
      .slice()
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
      .filter(loc => !usedIds.has(Number(loc.id)))
      .filter(loc => {
        if (!q) return true
        const hay = `${loc.code || ''} ${loc.name || ''}`.toLowerCase()
        return hay.includes(q)
      })
  }

  function renderBuildRows (filter = '') {
    const rows = visibleLocations(filter)
    if (!rows.length) {
      kBuildBody.innerHTML = `
        <tr>
          <td colspan="2" class="hint">No locations found.</td>
        </tr>
      `
      return
    }

    kBuildBody.innerHTML = rows.map(loc => {
      const checked = buildSelectedIds.has(Number(loc.id)) ? 'checked' : ''
      const label = loc.name ? `${loc.code} — ${loc.name}` : loc.code
      return `
        <tr>
          <td><input type="checkbox" data-build-pick="${loc.id}" ${checked} /></td>
          <td>${escapeHtml(label)}</td>
        </tr>
      `
    }).join('')
  }

  function renderDraftTree () {
    if (!draftTree.length) {
      kTreeBody.innerHTML = `
        <tr>
          <td colspan="4" class="hint">No groups or locations in the count tree yet.</td>
        </tr>
      `
      refreshTargetGroupOptions()
      return
    }

    const rows = []
    let idx = 1

    for (const node of draftTree) {
      if (node.type === 'group') {
        rows.push(`
          <tr data-tree-key="${escapeHtml(node.key)}" draggable="true">
            <td>${idx++}</td>
            <td>Group</td>
            <td>${escapeHtml(node.name)}</td>
            <td class="hint">Drag to reorder</td>
          </tr>
        `)

        for (const child of node.children || []) {
          rows.push(`
            <tr data-tree-key="${escapeHtml(child.key)}">
              <td>${idx++}</td>
              <td>Location</td>
              <td style="padding-left: 28px;">${escapeHtml(child.name)}</td>
              <td class="hint">In group</td>
            </tr>
          `)
        }
      } else {
        rows.push(`
          <tr data-tree-key="${escapeHtml(node.key)}" draggable="true">
            <td>${idx++}</td>
            <td>Location</td>
            <td>${escapeHtml(node.name)}</td>
            <td class="hint">Top-level</td>
          </tr>
        `)
      }
    }

    kTreeBody.innerHTML = rows.join('')
    refreshTargetGroupOptions()
  }

  function openBuildModal () {
    draftTree = structuredClone(structure)
    buildSelectedIds = new Set()
    kBuildSearch.value = ''
    kBuildScan.value = ''
    kNewGroupName.value = ''
    renderBuildRows('')
    renderDraftTree()
    kBuildModal.classList.remove('hidden')
    kBuildModal.setAttribute('aria-hidden', 'false')
    kBuildSearch.focus()
  }

  function closeBuildModal () {
    kBuildModal.classList.add('hidden')
    kBuildModal.setAttribute('aria-hidden', 'true')
  }

  function addGroup () {
    const name = normalizeName(kNewGroupName.value)
    if (!name) return setMsg('Group name required.', true)
    if (draftTree.some(n => n.type === 'group' && n.name === name)) {
      return setMsg('Group already exists.', true)
    }

    draftTree.push(makeGroupNode(name))
    kNewGroupName.value = ''
    renderDraftTree()
    setMsg(`Added group ${name}.`)
  }

  function selectedLocationObjects () {
    return locations.filter(loc => buildSelectedIds.has(Number(loc.id)))
  }

  function addSelectedToGroup () {
    const targetKey = String(kTargetGroup.value || '')
    if (!targetKey) return setMsg('Select a target group.', true)

    const group = draftTree.find(n => n.type === 'group' && n.key === targetKey)
    if (!group) return setMsg('Target group not found.', true)

    const selected = selectedLocationObjects()
    if (!selected.length) return setMsg('Select at least one visible location.', true)

    for (const loc of selected) {
      group.children.push(makeLocationNode(loc))
      buildSelectedIds.delete(Number(loc.id))
    }

    renderBuildRows(kBuildSearch.value)
    renderDraftTree()
    setMsg(`Added ${selected.length} location(s) to ${group.name}.`)
  }

  function addSelectedAsTopLevel () {
    const selected = selectedLocationObjects()
    if (!selected.length) return setMsg('Select at least one visible location.', true)

    for (const loc of selected) {
      draftTree.push(makeLocationNode(loc))
      buildSelectedIds.delete(Number(loc.id))
    }

    renderBuildRows(kBuildSearch.value)
    renderDraftTree()
    setMsg(`Added ${selected.length} top-level location(s).`)
  }

  function applyStructure () {
    structure = structuredClone(draftTree)
    closeBuildModal()
    renderQueue()
    setMsg(structure.length ? 'Count structure applied.' : 'No count structure built.')
  }

  function rowsForLocationCode (locationCode) {
    const locByCode = locByCodeMap()
    const itemBySku = itemBySkuMap()
    const loc = locByCode.get(String(locationCode || ''))
    if (!loc) return []

    return onhandRows
      .filter(r => String(r.location_code || '') === String(locationCode))
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

  function loadLocationIntoEntry (locationCode) {
    const rows = rowsForLocationCode(locationCode)
    activeLocationCode = String(locationCode || '')

    tbody.innerHTML = rows.map(r => rowHtml(r.item, r.expected, r.location.code)).join('')
    bindVarianceInputs()

    hint.textContent = rows.length
      ? `Loaded ${rows.length} row(s) for ${activeLocationCode}.`
      : `No inventory found for ${activeLocationCode}.`

    activeAreaFooter.textContent = `Active location: ${activeLocationCode}`
    renderQueue()
    showEntryView()
    syncButtons()

    tbody.querySelector('input[data-actual]')?.focus()
  }

  function orderedPrintSections () {
    const sections = []

    for (const node of structure) {
      if (node.type === 'group') {
        sections.push({
          heading: node.name,
          locations: (node.children || []).map(child => child.code)
        })
      } else if (node.type === 'location') {
        sections.push({
          heading: '',
          locations: [node.code]
        })
      }
    }

    return sections
  }

  async function printSheets () {
    setMsg('')
    const sections = orderedPrintSections()
    if (!sections.length) return setMsg('Build the count structure first.', true)

    const html = sections.map(section => {
      const heading = section.heading
        ? `<h1>Group: ${escapeHtml(section.heading)}</h1>`
        : ''

      const blocks = section.locations.map(code => {
        const rows = rowsForLocationCode(code)
        return `
          <div class="sheet">
            <h2>${escapeHtml(code)}</h2>
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
      }).join('')

      return `${heading}${blocks}`
    }).join('')

    const w = window.open('', '_blank', 'width=1200,height=900')
    if (!w) return setMsg('Popup blocked. Allow popups and try again.', true)

    w.document.write(`
      <html>
        <head>
          <title>Inventory Count Sheets</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 12px; font-size: 22px; }
            h2 { margin: 0 0 10px; font-size: 18px; }
            .sheet { page-break-after: always; margin-bottom: 28px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #222; padding: 8px; font-size: 12px; vertical-align: top; }
            th { background: #f3f3f3; text-align: left; }
            .qty { height: 28px; }
            .right { text-align: right; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  async function saveCountsForActiveLocation () {
    setMsg('')

    if (!activeLocationCode) return setMsg('Start a count first.', true)

    const trs = Array.from(tbody.querySelectorAll('tr'))
    if (!trs.length) return setMsg('No active count rows loaded.', true)

    const itemsNow = await window.api.itemsList()
    const itemIdBySku = new Map(itemsNow.map(i => [String(i.sku), i.id]))
    const loc = locByCodeMap().get(String(activeLocationCode || ''))
    if (!loc) return setMsg('Active location not found.', true)

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
          notes: `Count structure location ${activeLocationCode}`
        })
      }

      setMsg(`Saved ${toSave.length} count(s) for ${activeLocationCode}.`)
      showQueueView()
      renderQueue()
      window.dispatchEvent(new CustomEvent('data:changed'))
    } catch (e) {
      setMsg(e?.message || 'Failed saving counts.', true)
    } finally {
      btnSave.disabled = false
    }
  }

  function moveDraftTopLevel (fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return
    const fromIdx = draftTree.findIndex(n => n.key === fromKey)
    const toIdx = draftTree.findIndex(n => n.key === toKey)
    if (fromIdx === -1 || toIdx === -1) return

    const [moved] = draftTree.splice(fromIdx, 1)
    draftTree.splice(toIdx, 0, moved)
    renderDraftTree()
  }

  async function loadData () {
    ;[locations, items, onhandRows] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList(),
      window.api.reportsOnHand()
    ])
    renderQueue()
    showQueueView()
    hint.textContent = 'Active location loaded for counting.'
  }

  btnBuildCounts.addEventListener('click', openBuildModal)

  kBuildModalClose.addEventListener('click', closeBuildModal)
  kBuildModal.addEventListener('click', e => {
    if (e.target === kBuildModal) closeBuildModal()
  })

  kBuildSearch.addEventListener('input', () => {
    renderBuildRows(kBuildSearch.value)
  })

  kBuildScan.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.preventDefault()

    const scan = String(kBuildScan.value || '').trim().toUpperCase()
    if (!scan) return

    const loc = visibleLocations(kBuildSearch.value).find(l => String(l.code || '').toUpperCase() === scan)
    if (!loc) {
      setMsg(`Location not found or already added: ${scan}`, true)
      return
    }

    buildSelectedIds.add(Number(loc.id))
    renderBuildRows(kBuildSearch.value)
    setMsg(`Selected ${scan}.`)
    kBuildScan.value = ''
  })

  kBuildSelectVisible.addEventListener('click', () => {
    for (const loc of visibleLocations(kBuildSearch.value)) {
      buildSelectedIds.add(Number(loc.id))
    }
    renderBuildRows(kBuildSearch.value)
  })

  kBuildClearVisible.addEventListener('click', () => {
    for (const loc of visibleLocations(kBuildSearch.value)) {
      buildSelectedIds.delete(Number(loc.id))
    }
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

  kAddGroup.addEventListener('click', addGroup)
  kAddSelectedToGroup.addEventListener('click', addSelectedToGroup)
  kAddLooseLocations.addEventListener('click', addSelectedAsTopLevel)
  kBuildApply.addEventListener('click', applyStructure)

  kTreeBody.addEventListener('dragstart', e => {
    const row = e.target.closest('[data-tree-key]')
    if (!row) return
    draggedTreeKey = String(row.dataset.treeKey || '')
  })

  kTreeBody.addEventListener('dragover', e => {
    const row = e.target.closest('[data-tree-key]')
    if (!row) return
    const from = draftTree.find(n => n.key === draggedTreeKey)
    const to = draftTree.find(n => n.key === String(row.dataset.treeKey || ''))
    if (!from || !to) return
    if (from.type !== 'group' && from.type !== 'location') return
    if (to.type !== 'group' && to.type !== 'location') return
    e.preventDefault()
  })

  kTreeBody.addEventListener('drop', e => {
    const row = e.target.closest('[data-tree-key]')
    if (!row) return
    e.preventDefault()
    moveDraftTopLevel(draggedTreeKey, String(row.dataset.treeKey || ''))
    draggedTreeKey = null
  })

  kTreeBody.addEventListener('dragend', () => {
    draggedTreeKey = null
  })

  queueBody.addEventListener('click', e => {
    const btn = e.target.closest('[data-load-location]')
    if (!btn) return
    loadLocationIntoEntry(String(btn.dataset.loadLocation || ''))
  })

  btnStartCount.addEventListener('click', () => {
    const first = flattenStructureLocations(structure)[0]
    if (!first) return setMsg('Build the count structure first.', true)
    loadLocationIntoEntry(first.code)
  })

  btnBackToQueue.addEventListener('click', () => {
    showQueueView()
    renderQueue()
  })

  btnPrintSheets.addEventListener('click', printSheets)
  btnSave.addEventListener('click', saveCountsForActiveLocation)

  btnFinalizeCounts.addEventListener('click', () => {
    const total = flattenStructureLocations(structure).length
    if (!total) return setMsg('Nothing to finalize.', true)
    setMsg(`Finalize step not wired yet. ${total} location(s) in structure.`)
  })

  await loadData()
}
