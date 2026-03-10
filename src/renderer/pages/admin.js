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

  let resetPinEmployeeId = null
  let resetPinEmployeeName = ''

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

  const clearEmployeeFormState = () => {
    resetPinEmployeeId = null
    resetPinEmployeeName = ''

    if (employeeName) {
      employeeName.disabled = false
      employeeName.value = ''
    }

    if (employeePin) {
      employeePin.value = ''
    }

    if (btnAddEmployee) {
      btnAddEmployee.textContent = 'Add Employee'
    }
  }

  const beginResetPinFlow = (employeeId, name) => {
    resetPinEmployeeId = employeeId
    resetPinEmployeeName = String(name || '').trim()

    if (employeeName) {
      employeeName.value = resetPinEmployeeName
      employeeName.disabled = true
    }

    if (employeePin) {
      employeePin.value = ''
      employeePin.focus()
    }

    if (btnAddEmployee) {
      btnAddEmployee.textContent = 'Save PIN Reset'
    }

    setEmployeesMsg(`Enter a new PIN for ${resetPinEmployeeName}.`)
  }

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
        const safeName = escapeHtml(row?.name)

        return `
          <tr ${isActive ? '' : 'style="opacity:.55"'}>
            <td>${safeName}</td>
            <td>${statusText}</td>
            <td style="display:flex; gap:8px; flex-wrap:wrap;">
              <button
                class="btn"
                data-employee-toggle="${id}"
                data-next-active="${isActive ? '0' : '1'}"
              >
                ${toggleLabel}
              </button>

              <button
                class="btn"
                data-employee-reset-pin="${id}"
                data-employee-name="${safeName}"
              >
                Reset PIN
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

    if (!pin) {
      setEmployeesMsg('PIN is required.', true)
      employeePin?.focus()
      return
    }

    try {
      if (btnAddEmployee) btnAddEmployee.disabled = true

      if (resetPinEmployeeId) {
        await window.api.employeesSetPin({
          employee_id: resetPinEmployeeId,
          pin
        })

        setEmployeesMsg(`PIN updated for ${resetPinEmployeeName}.`)
        clearEmployeeFormState()
        await loadEmployees()
        employeeName?.focus()
        return
      }

      if (!name) {
        setEmployeesMsg('Employee name is required.', true)
        employeeName?.focus()
        return
      }

      await window.api.employeesCreate({ name, pin })

      clearEmployeeFormState()
      setEmployeesMsg('Employee added.')
      await loadEmployees()
      employeeName?.focus()
    } catch (e) {
      setEmployeesMsg(
        e?.message ||
          (resetPinEmployeeId
            ? 'Failed to reset PIN.'
            : 'Failed to add employee.'),
        true
      )
    } finally {
      if (btnAddEmployee) btnAddEmployee.disabled = false
    }
  }

  const handleEmployeeToggle = async btn => {
    const employeeId = Number(btn.dataset.employeeToggle)
    const nextActive = Number(btn.dataset.nextActive) === 1

    if (!employeeId) return

    setEmployeesMsg('')

    try {
      btn.disabled = true
      await window.api.employeesSetActive({
        id: employeeId,
        is_active: nextActive ? 1 : 0
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
      clearEmployeeFormState()
      openModal(employeesModal)
      await loadEmployees()
    })
  }

  if (btnCloseEmployeesModal && employeesModal) {
    btnCloseEmployeesModal.addEventListener('click', () => {
      clearEmployeeFormState()
      closeModal(employeesModal)
    })
  }

  if (employeesModal) {
    employeesModal.addEventListener('click', e => {
      if (e.target === employeesModal) {
        clearEmployeeFormState()
        closeModal(employeesModal)
      }
    })
  }

  if (btnAddEmployee) {
    btnAddEmployee.addEventListener('click', submitAddEmployee)
  }

  if (employeesTbody) {
    employeesTbody.addEventListener('click', async e => {
      const toggleBtn = e.target.closest('[data-employee-toggle]')
      if (toggleBtn) {
        await handleEmployeeToggle(toggleBtn)
        return
      }

      const resetBtn = e.target.closest('[data-employee-reset-pin]')
      if (resetBtn) {
        const employeeId = Number(resetBtn.dataset.employeeResetPin)
        const name = String(resetBtn.dataset.employeeName || '').trim()
        if (!employeeId) return
        beginResetPinFlow(employeeId, name)
      }
    })
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
    clearEmployeeFormState()
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