// Boots real Livewire (and Alpine) inside happy-dom, with our plugin installed
// and fetch() answered by an in-process fake Livewire server.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ url: 'http://localhost/', width: 1200, height: 800 })

window.livewireScriptConfig = { csrf: 'token', uri: '/livewire/update', moduleUrl: '/livewire', progressBar: false, nonce: '' }

let { server } = await import('./server.js')

globalThis.fetch = window.fetch = (url, options) => server.fetch(url, options)
globalThis.URL.createObjectURL = file => `blob:preview/${file.name}`
globalThis.URL.revokeObjectURL = () => {}

let { Livewire, Alpine } = await import('../../vendor/livewire/livewire/dist/livewire.esm.js')
let { install } = await import('../../resources/js/plugin.js')

globalThis.optimistic = install(Livewire, Alpine, { timeout: 0, warnOnUnload: true, linkTimeout: 200 })
globalThis.Livewire = Livewire
globalThis.Alpine = Alpine

Livewire.start()
