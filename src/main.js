const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// Put Chromium cache somewhere writable (prevents 0x5 cache errors on Windows)
app.commandLine.appendSwitch(
  'disk-cache-dir',
  path.join(app.getPath('userData'), 'Cache')
)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
const fs = require('fs')

const Database = require('better-sqlite3')
const dbLayer = require('./db/db')

let db

function getDbPath () {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'inventory.sqlite3')
}

function initDb () {
  const opened = dbLayer.openDb({ app })
  db = opened.db

  const schemaPath = path.join(__dirname, 'db', 'schema.sql')
  dbLayer.ensureSchema(db, schemaPath)
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Window state -> renderer
  win.on('maximize', () => win.webContents.send('win:maximize'))
  win.on('unmaximize', () => win.webContents.send('win:unmaximize'))

  win.maximize()

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.webContents.on('did-finish-load', () => {
    win.webContents.send(win.isMaximized() ? 'win:maximize' : 'win:unmaximize')
  })

  // Minimal DevTools toggle (Ctrl+Shift+I)
  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toUpperCase()
    if (input.control && input.shift && key === 'I') {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
}

function sessionPath (app) {
  return path.join(app.getPath('userData'), 'session.json')
}

function writeSession (app, sessionObj) {
  fs.writeFileSync(
    sessionPath(app),
    JSON.stringify(sessionObj, null, 2),
    'utf8'
  )
}

function readSession (app) {
  try {
    const p = sessionPath(app)
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function clearSession (app) {
  try {
    const p = sessionPath(app)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {}
}

app.whenReady().then(() => {
  initDb()

  ipcMain.handle('employees:setPin', async (_evt, payload) =>
    dbLayer.setEmployeePin(db, payload)
  )

  ipcMain.handle('auth:login', async (_evt, { employee_id, pin }) => {
    const res = dbLayer.verifyEmployeePin(db, { employee_id, pin })
    writeSession(app, {
      employee_id: res.employee.id,
      name: res.employee.name,
      ts: Date.now()
    })
    return { ok: true, employee: res.employee }
  })

  ipcMain.handle('auth:getSession', async () => readSession(app) || null)

  ipcMain.handle('auth:logout', async () => {
    clearSession(app)
    return { ok: true }
  })

  ipcMain.handle('db:getInfo', () => {
    const dbPath = getDbPath()
    const meta = dbLayer.getMeta(db)
    return { dbPath, schemaVersion: meta.schemaVersion }
  })

  ipcMain.handle('items:list', () => {
    return dbLayer.listItems(db)
  })

  ipcMain.handle('items:create', (_evt, item) => {
    return dbLayer.createItem(db, item)
  })

  ipcMain.handle('items:importCsv', (_evt, payload) => {
    return dbLayer.importItemsCsv(db, payload)
  })

  ipcMain.handle('employees:list', () => {
    return dbLayer.listEmployees(db)
  })

  ipcMain.handle('employees:create', (_evt, payload) => {
    return dbLayer.createEmployee(db, payload)
  })

  ipcMain.handle('employees:setActive', (_evt, payload) => {
    return dbLayer.setEmployeeActive(db, payload)
  })

  ipcMain.handle('employees:delete', (_evt, employeeId) => {
    return dbLayer.deleteEmployee(db, employeeId)
  })

  ipcMain.handle('locations:list', () => {
    return dbLayer.listLocations(db)
  })

  ipcMain.handle('locations:create', (_evt, loc) => {
    return dbLayer.createLocation(db, loc)
  })

  ipcMain.handle('receive:submit', (_evt, payload) => {
    return dbLayer.receiveItem(db, payload)
  })

  ipcMain.handle('reports:onhand', () => {
    return dbLayer.getOnHand(db)
  })

  ipcMain.handle('checkout:submit', (_evt, payload) => {
    return dbLayer.checkoutItem(db, payload)
  })

  ipcMain.handle('counts:getTheoretical', (_evt, { item_id, location_id }) => {
    const row = db
      .prepare(
        `
    SELECT on_hand FROM inventory_balances
    WHERE item_id=? AND location_id=?
  `
      )
      .get(Number(item_id), Number(location_id))
    return { theoretical_qty: Number(row?.on_hand ?? 0) }
  })

  ipcMain.handle('counts:submit', (_evt, payload) => {
    return dbLayer.countAndAdjust(db, payload)
  })

  ipcMain.handle('reports:suggestedOrders', () => {
    return dbLayer.getSuggestedOrders(db)
  })

  ipcMain.handle('items:update', (_evt, item) => {
    return dbLayer.updateItem(db, item)
  })

  ipcMain.handle('home:stats', () => {
    return dbLayer.getHomeStats(db)
  })

  ipcMain.handle('locations:update', (_evt, loc) => {
    return dbLayer.updateLocation(db, loc)
  })

  ipcMain.handle('locations:delete', (_evt, locationId) => {
    return dbLayer.deleteLocation(db, locationId)
  })

  ipcMain.handle('db:reset', async () => {
    try {
      // Close DB so the file isn't locked (WAL mode)
      try {
        db?.close?.()
      } catch {}

      const dbPath = getDbPath()
      const wal = `${dbPath}-wal`
      const shm = `${dbPath}-shm`

      // Delete main + WAL files if present
      for (const p of [dbPath, wal, shm]) {
        try {
          fs.unlinkSync(p)
        } catch {}
      }

      // Relaunch clean
      app.relaunch()
      app.exit(0)

      return { ok: true }
    } catch (e) {
      throw new Error(e?.message || 'DB reset failed.')
    }
  })

  ipcMain.handle('receive:submitBatch', async (_evt, payload) => {
    return dbLayer.receiveBatch(db, payload)
  })

  ipcMain.handle('items:findByBarcode', (_evt, barcode) => {
    return dbLayer.findItemByBarcode(db, barcode)
  })

  ipcMain.handle('items:attachBarcode', (_evt, payload) => {
    // payload: { item_id, barcode, source? }
    return dbLayer.attachBarcodeToItem(db, payload)
  })

  ipcMain.handle('admin:check', (_evt, password) => {
    const entered = String(password || '')
    const expected = process.env.UM_ADMIN_PASSWORD || 'umadmin' // TODO: set env later
    return { ok: entered === expected }
  })

  ipcMain.handle('locations:importCsv', (_evt, payload) =>
    dbLayer.importLocationsCsv(db, payload)
  )

  // Barcode/label rendering (offline, deterministic)
  const bwipjs = require('bwip-js')

  ipcMain.handle(
    'label:renderBarcodePng',
    async (_evt, { type, text, scale = 3 }) => {
      const t = String(text || '').trim()
      if (!t) throw new Error('Barcode text required.')

      // Map our UI types -> bwip-js bcid
      const bcid =
        String(type || '').toLowerCase() === 'code128' ? 'code128' : 'qrcode'

      const png = await bwipjs.toBuffer({
        bcid,
        text: t,
        scale: Number(scale) || 3,
        includetext: false,
        padding: 0
      })

      return `data:image/png;base64,${png.toString('base64')}`
    }
  )

  ipcMain.handle(
    'print:label2x1',
    async (_evt, { type = 'qrcode', text, sku = '', description = '' }) => {
      const t = String(text || '').trim()
      if (!t) throw new Error('Print text required.')

      const bcid =
        String(type).toLowerCase() === 'code128' ? 'code128' : 'qrcode'
      const png = await bwipjs.toBuffer({
        bcid,
        text: t,
        scale: 3,
        includetext: false,
        padding: 0
      })
      const dataUrl = `data:image/png;base64,${png.toString('base64')}`

      const labelHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Label</title>
<style>
  @page { size: 2in 1in; margin: 0; }
  html, body { width: 2in; height: 1in; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; }
  .wrap { box-sizing:border-box; width:2in; height:1in; padding:8px; display:flex; flex-direction:column; justify-content:space-between; }
  .sku { font-weight:900; font-size:14px; line-height:1.1; }
  .desc { font-size:10px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  img { width: 100%; height: 42px; object-fit: contain; }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="sku">${String(sku).replace(/</g, '&lt;')}</div>
      <div class="desc">${String(description).replace(/</g, '&lt;')}</div>
    </div>
    <div><img src="${dataUrl}"></div>
  </div>
</body>
</html>`

      const printWin = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, sandbox: false }
      })

      await printWin.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(labelHtml)
      )

      await new Promise((resolve, reject) => {
        printWin.webContents.print(
          { silent: false, printBackground: true },
          (success, err) => {
            if (success) return resolve({ canceled: false })

            const msg = String(err || 'Print failed')
            if (msg.toLowerCase().includes('canceled'))
              return resolve({ canceled: true })

            reject(new Error(msg))
          }
        )
      })

      printWin.close()
      return true
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
