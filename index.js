'use strict'

const { runEntrypoint } = require('@companion-module/base')
const instance = require('./src/instance')

runEntrypoint(instance, [])
