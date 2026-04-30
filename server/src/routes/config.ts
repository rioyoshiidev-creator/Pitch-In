import { Router } from 'express'

const router = Router()

// アプリの最低動作バージョン
// 正式リリース時にここを上げると古いアプリをブロックできる
const MIN_VERSION = '1.0.0'

router.get('/', (_req, res) => {
  res.json({ min_version: MIN_VERSION })
})

export default router
