const express = require('express')
const appfix = require('../services/appfix')

const router = express.Router()

function sendError(res, error) {
  const status = Number(error && error.status) || 500
  res.status(status).json({ error: error instanceof Error ? error.message : '修复失败' })
}

router.get('/images', async (_req, res) => {
  try {
    res.json(await appfix.listInstallImages())
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/inspect', async (req, res) => {
  try {
    res.json(await appfix.inspectApp(req.body && req.body.path))
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/repair', async (req, res) => {
  try {
    res.json(await appfix.repairApp(req.body && req.body.path))
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/eject', async (req, res) => {
  try {
    res.json(await appfix.ejectDiskImage(req.body && req.body.mountPoint))
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/settle', async (req, res) => {
  try {
    res.json(await appfix.settleInstall(req.body && req.body.path))
  } catch (error) {
    sendError(res, error)
  }
})

module.exports = router
