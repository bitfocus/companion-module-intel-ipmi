'use strict'

/**
 * index.js — module entry point.
 * Companion loads this file (see companion/manifest.json -> runtime.entrypoint)
 * and starts the instance over the nodejs-ipc host API.
 */

const { runEntrypoint } = require('@companion-module/base')
const { PixeraIpmiInstance } = require('./src/main')

runEntrypoint(PixeraIpmiInstance, [])
