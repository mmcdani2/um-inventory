// src/renderer/pages/receive.js
export async function mountReceive () {
  // ---------- DOM ----------
  // Banner + location controls
  const activeLocationBanner = document.getElementById('activeLocationBanner')
  const activeLocationText = document.getElementById('activeLocationText')
  const activeLocationSubtext = document.getElementById('activeLocationSubtext')
  const btnClearLocation = document.getElementById('btnClearLocation')
  const btnChangeLocation = document.getElementById('btnChangeLocation')

  // Scan inputs + errors + status
  const locationScanInput = document.getElementById('locationScanInput')
  const locationScanError = document.getElementById('locationScanError')

  const itemScanInput = document.getElementById('itemScanInput')
  const itemScanError = document.getElementById('itemScanError')

  const scanLocationCard = document.getElementById('locationScanCard')
  const scanItemCard = document.getElementById('itemScanCard')

  const lastScanStatus = document.getElementById('lastScanStatus')

  // Qty override
  const qtyOverrideEnabled = document.getElementById('qtyOverrideEnabled')
  const qtyOverrideInput = document.getElementById('qtyOverrideInput')

  // Lines + actions
  const receiveLinesList = document.getElementById('receiveLinesList')
  const emptyLinesHint = document.getElementById('emptyLinesHint')

  const btnUndoLast = document.getElementById('btnUndoLast')
  const btnClearBatch = document.getElementById('btnClearBatch')

  // Finalize bar
  const finalizeLineCount = document.getElementById('finalizeLineCount')
  const finalizeUnitCount = document.getElementById('finalizeUnitCount')
  const finalizeLocationText = document.getElementById('finalizeLocationText')
  const btnFinalizeReceive = document.getElementById('btnFinalizeReceive')

  // Optional details
  const receiveEmployeeId = document.getElementById('receiveEmployeeId')
  const receivePoNumber = document.getElementById('receivePoNumber')

  // Location change safety panel
  const locationChangeModal = document.getElementById('locationChangeModal')
  const btnLocationChangeCancel = document.getElementById(
    'btnLocationChangeCancel'
  )
  const btnLocationChangeClear = document.getElementById(
    'btnLocationChangeClear'
  )

  // Smart Add
  const smartAddWrap = document.getElementById('smartAddWrap')
  const btnSmartAddCancel = document.getElementById('btnSmartAddCancel')
  const btnSmartAddSave = document.getElementById('btnSmartAddSave')

  const smartAddBarcode = document.getElementById('smartAddBarcode')
  const smartAddSku = document.getElementById('smartAddSku')
  const smartAddDescription = document.getElementById('smartAddDescription')
  const smartAddCategory = document.getElementById('smartAddCategory')
  const smartAddUnit = document.getElementById('smartAddUnit')
  const smartAddVendor = document.getElementById('smartAddVendor')
  const smartAddDefaultCost = document.getElementById('smartAddDefaultCost')
  const smartAddReorderPoint = document.getElementById('smartAddReorderPoint')
  const smartAddReorderQty = document.getElementById('smartAddReorderQty')
  const smartAddBarcodeType = document.getElementById('smartAddBarcodeType')
  const smartAddPrintLabel = document.getElementById('smartAddPrintLabel')
  const smartAddStatus = document.getElementById('smartAddStatus')

  // Smart Add attach-to-existing
  const smartAddModeCreate = document.getElementById('smartAddModeCreate')
  const smartAddModeAttach = document.getElementById('smartAddModeAttach')
  const smartAddAttachWrap = document.getElementById('smartAddAttachWrap')
  const smartAddAttachSearch = document.getElementById('smartAddAttachSearch')
  const smartAddAttachSelect = document.getElementById('smartAddAttachSelect')

  // ---------- state ----------
  let locs = []
  let items = []

  let activeLoc = null // {id, code, name?}
  let pendingLoc = null // for safety prompt

  // item_id -> { item_id, sku, description, unit_cost, qty }
  const linesByItemId = new Map()
  const undoStack = [] // { item_id, deltaQty }

  // Smart Add context
  let smartAddPendingQty = 1
  let smartAddSuggestedQuery = ''

  // ---------- helpers ----------
  const esc = s =>
    String(s ?? '').replace(
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

  const toNum = (v, fallback = 0) => {
    const n = Number(String(v ?? '').trim())
    return Number.isFinite(n) ? n : fallback
  }

  const setErr = (el, text) => {
    if (!el) return
    el.textContent = text || ''
  }

  const setStatus = text => {
    if (!lastScanStatus) return
    lastScanStatus.textContent = text || ''
  }

  const focusSelect = el => {
    if (!el) return
    try {
      el.focus()
      el.select()
    } catch {}
  }

  function syncQtyOverrideEnabled () {
    const use = !!qtyOverrideEnabled?.checked
    qtyOverrideInput.disabled = !use
    if (!use) qtyOverrideInput.value = '1'
  }

  function getQtyForThisScan () {
    if (!qtyOverrideEnabled?.checked) return 1

    const raw = String(qtyOverrideInput.value ?? '').trim()
    const qty = Number.parseFloat(raw)

    return Number.isFinite(qty) && qty > 0 ? qty : 1
  }

  function resetQtyOverrideIfUsed () {
    if (qtyOverrideEnabled?.checked) {
      qtyOverrideInput.value = '1'
      qtyOverrideEnabled.checked = false
      syncQtyOverrideEnabled()
    }
  }

  function bannerTint (isSet) {
    if (!activeLocationBanner) return

    if (!isSet) {
      activeLocationBanner.style.borderColor = 'rgba(239,68,68,.55)'
      activeLocationBanner.style.background = 'rgba(239,68,68,.10)'
      return
    }
    activeLocationBanner.style.borderColor = 'rgba(34,197,94,.55)'
    activeLocationBanner.style.background = 'rgba(34,197,94,.10)'
  }

  function setActiveLocation (loc) {
    activeLoc = loc
      ? { id: loc.id, code: loc.code, name: loc.name || '' }
      : null

    if (!activeLoc) {
      bannerTint(false)
      activeLocationText.textContent = 'NONE SET'
      activeLocationSubtext.textContent = 'Scan a location to continue.'
      finalizeLocationText.textContent = '—'
      itemScanInput.disabled = true
      focusSelect(locationScanInput)
      syncFinalizeEnabled()
      syncReceivePhaseUi()
      return
    }

    bannerTint(true)
    activeLocationText.textContent = activeLoc.code
    activeLocationSubtext.textContent = activeLoc.name ? activeLoc.name : ''
    finalizeLocationText.textContent = activeLoc.code
    itemScanInput.disabled = false
    focusSelect(itemScanInput)
    syncFinalizeEnabled()
    syncReceivePhaseUi()
  }

  function syncReceivePhaseUi () {
    const hasLoc = !!activeLoc
    const hasLines = linesByItemId.size > 0

    if (scanLocationCard) scanLocationCard.hidden = hasLoc
    if (scanItemCard) scanItemCard.hidden = !hasLoc

    // tiny change-location allowed only before any lines exist
    if (btnChangeLocation) btnChangeLocation.hidden = !hasLoc || hasLines
  }

  function syncFinalizeEnabled () {
    const hasLines = linesByItemId.size > 0
    if (btnUndoLast) btnUndoLast.disabled = undoStack.length === 0
    btnClearBatch.disabled = !hasLines
    btnFinalizeReceive.disabled = !(activeLoc && hasLines) || smartAddIsOpen()
  }

  function renderLines () {
    const rows = Array.from(linesByItemId.values())
    const lineCount = rows.length
    const totalUnits = rows.reduce((a, x) => a + Number(x.qty || 0), 0)

    finalizeLineCount.textContent = String(lineCount)
    finalizeUnitCount.textContent = String(totalUnits)

    receiveLinesList.innerHTML = rows
      .map(
        ln => `
        <li class="card-block" style="padding:10px 12px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
            <div style="min-width:0;">
              <div class="mono" style="font-weight:900;">${esc(ln.sku)}</div>
              <div class="msg" style="margin-top:4px;">${esc(
                ln.description
              )}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="mono" style="font-weight:900; font-size:16px;">${Number(
                ln.qty || 0
              ).toFixed(2)}</div>
              <button class="btn" type="button" data-remove="${
                ln.item_id
              }">Remove</button>
            </div>
          </div>
        </li>
      `
      )
      .join('')

    emptyLinesHint.hidden = lineCount !== 0
    syncFinalizeEnabled()
  }

  async function findLocationByCode (raw) {
    const needle = String(raw || '')
      .trim()
      .toLowerCase()
    if (!needle) return null

    // Always fetch fresh locations instead of relying on stale in-memory locs
    const freshLocs = await window.api.locationsList()
    locs = Array.isArray(freshLocs) ? freshLocs : []

    return (
      locs.find(
        l =>
          String(l.code || '')
            .trim()
            .toLowerCase() === needle
      ) || null
    )
  }

  function findItemByScan (raw) {
    const needle = String(raw || '')
      .trim()
      .toLowerCase()
    if (!needle) return null

    // Match house barcode stored on items table
    const byHouse = items.find(
      i =>
        String(i.barcode ?? '')
          .trim()
          .toLowerCase() === needle
    )
    if (byHouse) return byHouse

    // Match SKU
    const bySku = items.find(
      i =>
        String(i.sku ?? '')
          .trim()
          .toLowerCase() === needle
    )
    if (bySku) return bySku

    return null
  }

  function addScan (item, qtyToAdd) {
    const deltaRaw = qtyToAdd ?? 1
    const delta = Number.parseFloat(String(deltaRaw).trim())
    if (!Number.isFinite(delta) || delta <= 0) return

    const key = Number(item.id)

    const existing = linesByItemId.get(key)
    if (existing) {
      existing.qty += delta
      linesByItemId.set(key, existing)
    } else {
      linesByItemId.set(key, {
        item_id: key,
        sku: item.sku,
        description: item.description,
        unit_cost: toNum(item.default_cost, 0),
        qty: delta
      })
    }

    undoStack.push({ item_id: key, deltaQty: delta })
    renderLines()

    setStatus(`OK: +${delta} ${item.sku} @ ${activeLoc.code}`)
    resetQtyOverrideIfUsed()
  }

  function undoLast () {
    const last = undoStack.pop()
    if (!last) return

    const ln = linesByItemId.get(last.item_id)
    if (!ln) return

    ln.qty -= last.deltaQty
    if (ln.qty <= 0) linesByItemId.delete(last.item_id)
    else linesByItemId.set(last.item_id, ln)

    renderLines()
    setStatus('Undo: last scan removed')
    focusSelect(itemScanInput)
  }

  function clearBatch () {
    linesByItemId.clear()
    undoStack.length = 0
    renderLines()
  }

  function openLocationChangePrompt (nextLoc) {
    pendingLoc = nextLoc
    locationChangeModal.hidden = false
    btnLocationChangeCancel?.focus()
    syncFinalizeEnabled()
  }

  function closeLocationChangePrompt () {
    pendingLoc = null
    locationChangeModal.hidden = true
    syncFinalizeEnabled()
  }

  function smartAddIsOpen () {
    return smartAddWrap && !smartAddWrap.hidden
  }

  function smartAddMode () {
    return smartAddModeAttach?.checked ? 'attach' : 'create'
  }

  function syncSmartAddModeUi () {
    const mode = smartAddMode()
    if (smartAddAttachWrap) smartAddAttachWrap.hidden = mode !== 'attach'
    if (smartAddPrintLabel) smartAddPrintLabel.disabled = mode !== 'create'
    if (smartAddBarcodeType) smartAddBarcodeType.disabled = mode !== 'create'
  }

  function buildSmartAddSuggestions (queryRaw) {
    const q = String(queryRaw || '')
      .trim()
      .toLowerCase()
    if (!q) return []

    const scoreItem = it => {
      const sku = String(it.sku || '').toLowerCase()
      const desc = String(it.description || '').toLowerCase()
      let s = 0
      if (sku === q) s += 100
      if (desc === q) s += 80
      if (sku.includes(q)) s += 50
      if (desc.includes(q)) s += 35
      const toks = q.split(/\s+/).filter(Boolean)
      for (const t of toks) {
        if (sku.includes(t)) s += 8
        if (desc.includes(t)) s += 5
      }
      return s
    }

    return items
      .map(it => ({ it, s: scoreItem(it) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(x => x.it)
  }

  function renderSmartAddSuggestions (queryRaw) {
    if (!smartAddAttachSelect) return
    const suggestions = buildSmartAddSuggestions(queryRaw)
    smartAddAttachSelect.innerHTML = suggestions
      .map(it => {
        const sku = esc(it.sku)
        const desc = esc(it.description)
        return `<option value="${Number(it.id)}">${sku} — ${desc}</option>`
      })
      .join('')
  }

  function guessItemFromBarcode (barcodeRaw) {
    const b = String(barcodeRaw || '').trim()
    const digitsOnly = /^[0-9]+$/.test(b)
    const len = b.length

    const skuPrefix = digitsOnly
      ? len === 12
        ? 'UPC'
        : len === 13
        ? 'EAN'
        : 'BC'
      : 'BC'
    const sku = `${skuPrefix}-${b}`

    const description =
      digitsOnly && len === 12
        ? `New item (UPC ${b})`
        : digitsOnly && len === 13
        ? `New item (EAN ${b})`
        : `New item (${b})`

    return { sku, description, category: 'Uncategorized' }
  }

  async function openSmartAdd (barcodeValue, qtyToAdd) {
    smartAddPendingQty = Math.max(0, Number.parseFloat(qtyToAdd ?? 1))
    if (!Number.isFinite(smartAddPendingQty) || smartAddPendingQty <= 0)
      smartAddPendingQty = 1

    setErr(smartAddStatus, '')
    smartAddWrap.hidden = false
    if (btnSmartAddSave) btnSmartAddSave.disabled = false

    smartAddBarcode.value = String(barcodeValue || '').trim()

    const guess = guessItemFromBarcode(smartAddBarcode.value)
    smartAddSku.value = guess.sku
    smartAddDescription.value = guess.description
    smartAddCategory.value = guess.category
    smartAddUnit.value = smartAddUnit.value || 'EA'
    smartAddVendor.value = ''
    smartAddDefaultCost.value = String(toNum(smartAddDefaultCost.value, 0) || 0)
    smartAddReorderPoint.value = String(
      toNum(smartAddReorderPoint.value, 0) || 0
    )
    smartAddReorderQty.value = String(toNum(smartAddReorderQty.value, 0) || 0)
    if (!smartAddBarcodeType.value) smartAddBarcodeType.value = 'qr'
    if (smartAddPrintLabel) smartAddPrintLabel.checked = true

    try {
      setErr(smartAddStatus, 'Looking up barcode…')
      const info = await window.api.barcodeLookup(smartAddBarcode.value)

      if (info) {
        if (info.title) smartAddDescription.value = info.title
        if (info.category) {
          const parts = String(info.category)
            .split('>')
            .map(s => s.trim())
            .filter(Boolean)
          smartAddCategory.value = parts.length
            ? parts[parts.length - 1]
            : String(info.category).trim()
        }
        if (info.brand) smartAddVendor.value = info.brand
      }
      setErr(smartAddStatus, '')
    } catch {
      setErr(smartAddStatus, '')
    }

    // Seed attach suggestions using best-known description
    smartAddSuggestedQuery = String(smartAddDescription.value || '').trim()
    if (smartAddAttachSearch)
      smartAddAttachSearch.value = smartAddSuggestedQuery
    renderSmartAddSuggestions(smartAddSuggestedQuery)
    syncSmartAddModeUi()

    itemScanInput.disabled = true
    locationScanInput.disabled = true

    setStatus(`NOT FOUND: ${smartAddBarcode.value} → Smart Add`)
    focusSelect(smartAddSku)
    syncFinalizeEnabled()
  }

  function closeSmartAdd () {
    smartAddWrap.hidden = true

    locationScanInput.disabled = false
    itemScanInput.disabled = !activeLoc

    setErr(smartAddStatus, '')
    smartAddPendingQty = 1
    smartAddSuggestedQuery = ''

    if (activeLoc) focusSelect(itemScanInput)
    else focusSelect(locationScanInput)

    syncFinalizeEnabled()
  }

  async function refreshItems () {
    const itemRes = await window.api.itemsList()
    items = Array.isArray(itemRes) ? itemRes : []
  }

  async function refreshEmployees () {
    if (!receiveEmployeeId) return

    const employees = await window.api.employeesList()

    receiveEmployeeId.innerHTML = '<option value="">Select…</option>'
    for (const e of employees) {
      if (!e || !e.id) continue

      const opt = document.createElement('option')
      opt.value = String(e.id)

      const inactive = Number(e.is_active) === 0
      opt.textContent = inactive ? `${e.name} (inactive)` : e.name

      if (inactive) opt.disabled = true

      receiveEmployeeId.appendChild(opt)
    }

    // sticky last-selected employee per device
    try {
      const last = localStorage.getItem('receive:lastEmployeeId')
      if (last && receiveEmployeeId.querySelector(`option[value="${last}"]`)) {
        receiveEmployeeId.value = last
      }
    } catch {}
  }

  receiveEmployeeId?.addEventListener('change', () => {
    try {
      localStorage.setItem(
        'receive:lastEmployeeId',
        String(receiveEmployeeId.value || '')
      )
    } catch {}
  })

  // ---------- load ----------
  async function loadData () {
    const [locRes, itemRes] = await Promise.all([
      window.api.locationsList(),
      window.api.itemsList()
    ])
    locs = Array.isArray(locRes) ? locRes : []
    items = Array.isArray(itemRes) ? itemRes : []
  }

  // ---------- events ----------
  ;[
    locationScanInput,
    itemScanInput,
    qtyOverrideInput,
    receiveEmployeeId,
    receivePoNumber,
    smartAddBarcode,
    smartAddSku,
    smartAddDescription,
    smartAddCategory,
    smartAddUnit,
    smartAddVendor,
    smartAddDefaultCost,
    smartAddReorderPoint,
    smartAddReorderQty
  ].forEach(el => {
    el?.addEventListener('focus', () => {
      try {
        el.select()
      } catch {}
    })
  })

  qtyOverrideEnabled?.addEventListener('change', () => {
    syncQtyOverrideEnabled()
    if (qtyOverrideEnabled.checked) focusSelect(qtyOverrideInput)
    else focusSelect(itemScanInput)
  })

  locationScanInput?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return
    e.preventDefault()

    setErr(locationScanError, '')
    const raw = locationScanInput.value
    const hit = await findLocationByCode(raw)

    if (!hit) {
      setErr(locationScanError, `Location not found: "${raw}"`)
      setStatus(`ERROR: location not found (${raw})`)
      focusSelect(locationScanInput)
      return
    }

    const hasLines = linesByItemId.size > 0
    if (activeLoc && hasLines && hit.id !== activeLoc.id) {
      openLocationChangePrompt(hit)
      locationScanInput.value = ''
      return
    }

    setActiveLocation(hit)
    focusSelect(itemScanInput)
    setStatus(`OK: location set → ${hit.code}`)
    locationScanInput.value = ''
  })

  itemScanInput?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return
    e.preventDefault()

    setErr(itemScanError, '')

    if (!activeLoc) {
      setErr(itemScanError, 'Set ACTIVE LOCATION first.')
      setStatus('ERROR: no active location')
      focusSelect(locationScanInput)
      return
    }

    const raw = itemScanInput.value
    const qty = getQtyForThisScan()

    let hit = findItemByScan(raw)
    if (!hit) hit = await window.api.itemsFindByBarcode(raw)

    if (!hit) {
      void openSmartAdd(raw, qty)
      itemScanInput.value = ''
      return
    }

    addScan(hit, qty)
    itemScanInput.value = ''
    focusSelect(itemScanInput)
  })

  btnClearLocation?.addEventListener('click', () => {
    if (smartAddIsOpen()) return

    // Don’t clear batch from here. Clear batch in ONE place only.
    if (linesByItemId.size > 0) {
      setErr(
        locationScanError,
        'Clear the batch before clearing/changing location.'
      )
      setStatus('Batch has lines — clear batch first.')
      try {
        btnClearBatch?.focus()
      } catch {}
      return
    }

    setActiveLocation(null)
    setErr(locationScanError, '')
    setErr(itemScanError, '')
    setStatus('Cleared: scan a location to continue')
  })

  btnChangeLocation?.addEventListener('click', () => {
    if (smartAddIsOpen()) return
    focusSelect(locationScanInput)
  })

  btnLocationChangeCancel?.addEventListener('click', () => {
    closeLocationChangePrompt()
    focusSelect(itemScanInput)
  })

  receiveLinesList?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-remove]')
    if (!btn) return

    const itemId = Number(btn.getAttribute('data-remove'))
    if (!itemId) return

    linesByItemId.delete(itemId)
    renderLines()
    setStatus('Line removed')
    focusSelect(itemScanInput)
  })

  btnUndoLast?.addEventListener('click', undoLast)

  btnClearBatch?.addEventListener('click', () => {
    if (smartAddIsOpen()) return
    if (!linesByItemId.size) return
    const ok = confirm('Clear current batch lines?')
    if (!ok) return
    clearBatch()
    setStatus('Batch cleared')
    focusSelect(itemScanInput)
  })

  btnSmartAddCancel?.addEventListener('click', closeSmartAdd)

  smartAddModeCreate?.addEventListener('change', () => {
    syncSmartAddModeUi()
    focusSelect(smartAddSku)
  })

  smartAddModeAttach?.addEventListener('change', () => {
    syncSmartAddModeUi()
    focusSelect(smartAddAttachSearch)
  })

  smartAddAttachSearch?.addEventListener('input', e => {
    const q = e?.target?.value
    renderSmartAddSuggestions(q)
  })

  btnSmartAddSave?.addEventListener('click', async () => {
    if (btnSmartAddSave.disabled) return // ✅ guard against double-submit
    btnSmartAddSave.disabled = true // ✅ disable immediately

    setErr(smartAddStatus, '')

    const vendorBarcode = String(smartAddBarcode.value || '').trim()

    const houseBarcode =
      'HB-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase()

    const sku = String(smartAddSku.value || '').trim()
    const description = String(smartAddDescription.value || '').trim()

    try {
      if (!vendorBarcode) {
        setErr(smartAddStatus, 'Barcode is required.')
        return
      }

      // Attach mode: require selection; SKU/Description not required.
      if (smartAddMode() === 'attach') {
        const selId = Number(smartAddAttachSelect?.value)
        if (!selId) {
          setErr(smartAddStatus, 'Select an item to attach this barcode to.')
          return
        }
      } else {
        if (!sku) {
          setErr(smartAddStatus, 'SKU is required.')
          return
        }
        if (!description) {
          setErr(smartAddStatus, 'Description is required.')
          return
        }
      }

      // If barcode already exists, force attach-to-existing instead of creating a dupe.
      const existing = await window.api.itemsFindByBarcode(vendorBarcode)
      if (existing && existing.id) {
        if (smartAddModeAttach) smartAddModeAttach.checked = true
        syncSmartAddModeUi()
        if (smartAddAttachSearch) {
          smartAddAttachSearch.value = String(existing.sku || '')
          renderSmartAddSuggestions(smartAddAttachSearch.value)
        }
        if (smartAddAttachSelect)
          smartAddAttachSelect.value = String(existing.id)

        setErr(
          smartAddStatus,
          `Barcode already linked to ${existing.sku}. Select item and Save to attach/add to batch.`
        )

        btnSmartAddSave.disabled = false // ✅ re-enable because we're staying in the modal
        return
      }

      if (smartAddMode() === 'attach') {
        const targetId = Number(smartAddAttachSelect.value)
        const target = items.find(i => Number(i.id) === targetId)
        if (!target)
          throw new Error('Selected item not found. Refresh and try again.')

        await window.api.itemsAttachBarcode({
          item_id: targetId,
          barcode: vendorBarcode,
          source: 'vendor'
        })
        await refreshItems()
        await refreshEmployees()
        addScan(target, smartAddPendingQty)
        closeSmartAdd()
        window.dispatchEvent(new CustomEvent('data:changed'))
        return
      }

      const itemPayload = {
        sku,
        description,
        category: String(smartAddCategory.value || '').trim(),
        unit: String(smartAddUnit.value || 'EA').trim() || 'EA',
        vendor: String(smartAddVendor.value || '').trim(),
        barcode: houseBarcode,
        reorder_point: toNum(smartAddReorderPoint.value, 0),
        reorder_qty: toNum(smartAddReorderQty.value, 0),
        default_cost: toNum(smartAddDefaultCost.value, 0),
        is_active: 1
      }

      const created = await window.api.itemsCreate(itemPayload)
      await refreshItems()

      const createdItem =
        created && created.id
          ? created
          : items.find(
              i => String(i.sku || '').toLowerCase() === sku.toLowerCase()
            ) ||
            items.find(
              i =>
                String(i.barcode || '').toLowerCase() ===
                houseBarcode.toLowerCase()
            )

      if (!createdItem)
        throw new Error('Item created, but could not re-load it.')

      await window.api.itemsAttachBarcode({
        item_id: createdItem.id,
        barcode: vendorBarcode,
        source: 'vendor'
      })

      addScan(createdItem, smartAddPendingQty)

      if (smartAddPrintLabel?.checked) {
        try {
          await window.api.printLabel2x1({
            type: String(smartAddBarcodeType.value || 'qrcode'),
            text: houseBarcode,
            sku,
            description
          })
        } catch (e) {
          const msg = String(e?.message || '')
          if (!msg.toLowerCase().includes('canceled')) throw e
        }
      }

      closeSmartAdd()
      window.dispatchEvent(new CustomEvent('data:changed'))
    } catch (e) {
      setErr(smartAddStatus, e?.message || 'Smart Add failed.')
    } finally {
      if (smartAddIsOpen()) btnSmartAddSave.disabled = false
    }
  })

  btnFinalizeReceive?.addEventListener('click', async () => {
    setErr(itemScanError, '')
    setErr(locationScanError, '')

    if (smartAddIsOpen()) return

    if (!activeLoc) {
      setErr(locationScanError, 'Set ACTIVE LOCATION first.')
      return focusSelect(locationScanInput)
    }

    const lines = Array.from(linesByItemId.values())
    if (!lines.length) {
      setErr(itemScanError, 'No lines to receive.')
      return focusSelect(itemScanInput)
    }

    const empId = Number(receiveEmployeeId?.value || 0)
    if (!empId) {
      setErr(itemScanError, 'Employee is required.')
      // open details panel if closed
      try {
        document.getElementById('batchDetails').open = true
      } catch {}
      return focusSelect(receiveEmployeeId)
    }

    btnFinalizeReceive.disabled = true

    try {
      const payload = {
        user_initials: '',
        employee_id: Number(receiveEmployeeId?.value || 0),
        po_number: String(receivePoNumber?.value || '').trim(),
        location_id: Number(activeLoc.id),
        lines
      }

      await window.api.receiveSubmitBatch(payload)

      clearBatch()
      setStatus(`OK: batch finalized → ${activeLoc.code}`)
      window.dispatchEvent(new CustomEvent('data:changed'))
      focusSelect(itemScanInput)
    } catch (e) {
      setErr(itemScanError, e?.message || 'Finalize failed.')
      setStatus(`ERROR: finalize failed`)
      focusSelect(itemScanInput)
    } finally {
      syncFinalizeEnabled()
    }
  })

  window.addEventListener('beforeunload', e => {
    if (linesByItemId.size > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  // ---------- init ----------
  await loadData()
  syncQtyOverrideEnabled()
  renderLines()
  setActiveLocation(null)
  setStatus('Ready: scan a location')
  focusSelect(locationScanInput)

  window.addEventListener('data:changed', async () => {
    await loadData()
  })
}
