/**
 * src/index.mjs — module entry point (connection API 2.x).
 * Companion imports this file (see companion/manifest.json -> runtime.entrypoint)
 * and expects the instance class as the default export plus named UpgradeScripts.
 */

import { IpmiInstance } from './main.js'
import UpgradeScripts from './upgrades.js'

export default IpmiInstance
export { UpgradeScripts }
