// src/renderer/pages/admin.js
export async function mountAdmin () {
  const btnReset = document.getElementById('btnResetDb')
  const msg = document.getElementById('adminMsg')

  const locCsvFile = document.getElementById('locCsvFile')
  const locCsvName = document.getElementById('locCsvName')
  const btnImportLocCsv = document.getElementById('btnImportLocCsv')
  const adminToolsMsg = document.getElementById('adminToolsMsg')

  const btnOpenEmployeesModal = document.getElementById('btnOpenEmployeesModal')
  const btnCloseEmployeesModal = document.getElementById(
    'btnCloseEmployeesModal'
  )
  const employeesModal = document.getElementById('employeesModal')
  const employeesTbody = document.getElementById('employeesTbody')
  const employeesMsg = document.getElementById('employeesMsg')

  const employeeName = document.getElementById('employeeName')
  const employeePin = document.getElementById('employeePin')
  const btnAddEmployee = document.getElementById('btnAddEmployee')

  const btnOpenLocationsModal = document.getElementById('btnOpenLocationsModal')
  const btnCloseLocationsModal = document.getElementById(
    'btnCloseLocationsModal'
  )
  const locationsModal = document.getElementById('locationsModal')

  const btnOpenReceivesModal = document.getElementById('btnOpenReceivesModal')
  const btnCloseReceivesModal = document.getElementById('btnCloseReceivesModal')
  const receivesModal = document.getElementById('receivesModal')

  const setMsg = (t, err = false) => {
    if (!msg) return
    msg.textContent = t || ''
    msg.classList.toggle('err', !!err)
  }

  const setToolsMsg = (t, err = false) => {
    if (!adminToolsMsg) return
    adminToolsMsg.textContent = t || ''
    adminToolsMsg.classList.toggle('err', !!err)
  }

  const setEmployeesMsg = (t, err = false) => {
    if (!employeesMsg) return
    employeesMsg.textContent = t || ''
    employeesMsg.classList.toggle('err', !!err)
  }

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, ch => {
      switch (ch) {
        case '&':
          return '&amp;'
        case '<':
          return '&lt;'
        case '>':
          return '&gt;'
        case '"':
          return '&quot;'
        case "'":
          return '&#39;'
        default:
          return ch
      }
    })

  const renderEmployees = rows => {
    if (!employeesTbody) return

    if (!Array.isArray(rows) || rows.length === 0) {
      employeesTbody.innerHTML = `
      <tr>
        <td colspan="3" class="muted">No employees found.</td>
      </tr>
    `
      return
    }

    employeesTbody.innerHTML = rows
      .map(row => {
        const id = Number(row?.id)
        const isActive = Number(row?.is_active) === 1
        const statusText = isActive ? 'Active' : 'Inactive'
        const toggleLabel = isActive ? 'Deactivate' : 'Reactivate'

        return `
        <tr ${isActive ? '' : 'style="opacity:.55"'}>
          <td>${escapeHtml(row?.name)}</td>
          <td>${statusText}</td>
          <td>
            <button
              class="btn"
              data-employee-toggle="${id}"
              data-next-active="${isActive ? '0' : '1'}"
            >
              ${toggleLabel}
            </button>
          </td>
        </tr>
      `
      })
      .join('')
  }

  const loadEmployees = async () => {
    setEmployeesMsg('')

    try {
      const rows = await window.api.employeesList()
      renderEmployees(rows || [])
    } catch (e) {
      renderEmployees([])
      setEmployeesMsg(e?.message || 'Failed to load employees.', true)
    }
  }

  const submitAddEmployee = async () => {
    setEmployeesMsg('')

    const name = String(employeeName?.value || '').trim()
    const pin = String(employeePin?.value || '').trim()

    if (!name) {
      setEmployeesMsg('Employee name is required.', true)
      employeeName?.focus()
      return
    }

    if (!pin) {
      setEmployeesMsg('PIN is required.', true)
      employeePin?.focus()
      return
    }

    try {
      if (btnAddEmployee) btnAddEmployee.disabled = true

      await window.api.employeesCreate({ name, pin })

      if (employeeName) employeeName.value = ''
      if (employeePin) employeePin.value = ''

      setEmployeesMsg('Employee added.')
      await loadEmployees()
      employeeName?.focus()
    } catch (e) {
      setEmployeesMsg(e?.message || 'Failed to add employee.', true)
    } finally {
      if (btnAddEmployee) btnAddEmployee.disabled = false
    }
  }

  const handleEmployeeToggle = async e => {
    const btn = e.target.closest('[data-employee-toggle]')
    if (!btn) return

    const employeeId = Number(btn.dataset.employeeToggle)
    const nextActive = Number(btn.dataset.nextActive) === 1

    if (!employeeId) return

    setEmployeesMsg('')

    try {
      btn.disabled = true
      await window.api.employeesSetActive({
        employeeId,
        isActive: nextActive
      })
      await loadEmployees()
    } catch (e) {
      setEmployeesMsg(e?.message || 'Failed to update employee.', true)
      btn.disabled = false
    }
  }

  const openModal = el => {
    if (!el) return
    el.style.display = 'flex'
  }

  const closeModal = el => {
    if (!el) return
    el.style.display = 'none'
  }

  const wireModal = ({ openBtn, closeBtn, modal }) => {
    if (openBtn && modal) {
      openBtn.addEventListener('click', () => openModal(modal))
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => closeModal(modal))
    }

    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeModal(modal)
      })
    }
  }

  // Employees modal is custom so it can load rows on open
  if (btnOpenEmployeesModal && employeesModal) {
    btnOpenEmployeesModal.addEventListener('click', async () => {
      openModal(employeesModal)
      await loadEmployees()
    })
  }

  if (btnCloseEmployeesModal && employeesModal) {
    btnCloseEmployeesModal.addEventListener('click', () =>
      closeModal(employeesModal)
    )
  }

  if (employeesModal) {
    employeesModal.addEventListener('click', e => {
      if (e.target === employeesModal) closeModal(employeesModal)
    })
  }

  if (btnAddEmployee) {
    btnAddEmployee.addEventListener('click', submitAddEmployee)
  }

  if (employeesTbody) {
    employeesTbody.addEventListener('click', handleEmployeeToggle)
  }

  if (employeeName) {
    employeeName.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAddEmployee()
    })
  }

  if (employeePin) {
    employeePin.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAddEmployee()
    })
  }

  // Standard modals
  wireModal({
    openBtn: btnOpenLocationsModal,
    closeBtn: btnCloseLocationsModal,
    modal: locationsModal
  })

  wireModal({
    openBtn: btnOpenReceivesModal,
    closeBtn: btnCloseReceivesModal,
    modal: receivesModal
  })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    closeModal(employeesModal)
    closeModal(locationsModal)
    closeModal(receivesModal)
  })

  // ---- Reset DB ----
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      setMsg('')
      const ok = confirm(
        'Wipe local database and restart? This cannot be undone.'
      )
      if (!ok) return

      try {
        await window.api.dbReset()
        setMsg('Reset requested…')
      } catch (e) {
        setMsg(e?.message || 'Reset failed.', true)
      }
    })
  }

  // ---- Locations CSV Import ----
  if (locCsvFile && locCsvName && btnImportLocCsv) {
    btnImportLocCsv.disabled = true
    locCsvName.textContent = 'No file selected'

    locCsvFile.addEventListener('change', () => {
      const f = locCsvFile.files && locCsvFile.files[0]
      locCsvName.textContent = f ? f.name : 'No file selected'
      btnImportLocCsv.disabled = !f
      setToolsMsg('')
    })

    btnImportLocCsv.addEventListener('click', async () => {
      setToolsMsg('')
      const f = locCsvFile.files && locCsvFile.files[0]
      if (!f) return

      try {
        btnImportLocCsv.disabled = true
        const csvText = await f.text()

        const res = await window.api.locationsImportCsv({ csvText })

        setToolsMsg(
          `Locations imported. Inserted: ${res?.inserted ?? 0}, Skipped: ${
            res?.skipped ?? 0
          }, Total: ${res?.total ?? 0}`
        )

        window.dispatchEvent(new CustomEvent('data:changed'))
      } catch (e) {
        setToolsMsg(e?.message || 'Locations import failed.', true)
      } finally {
        const f2 = locCsvFile.files && locCsvFile.files[0]
        btnImportLocCsv.disabled = !f2
      }
    })
  }
}
