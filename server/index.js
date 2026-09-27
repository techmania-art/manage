import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import api from './routes/api.js'
import db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.json())

app.use('/api', api)

// Serve static build in production
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distDir, 'index.html'), err => { if (err) next() })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧭 LifePilot AI running on http://0.0.0.0:${PORT}`)
})
