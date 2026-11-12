<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Livewire Optimistic UI · Demo</title>

    <script>
        // Simulated network. Wraps fetch() for Livewire's update requests only.
        (function () {
            let storageKey = 'optimistic-demo-network'
            let defaults = { latency: 800, jitter: 0, mode: 'normal', once: true, failRate: 0 }
            let saved = {}
            try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch (e) {}

            let settings = Object.assign({}, defaults, saved)
            let original = window.fetch.bind(window)
            let hung = []
            let counter = 0
            let sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

            let save = () => {
                try { localStorage.setItem(storageKey, JSON.stringify(settings)) } catch (e) {}
                window.dispatchEvent(new CustomEvent('demo-network:change'))
            }

            let record = (request, patch) => {
                Object.assign(request, patch)
                window.dispatchEvent(new CustomEvent('demo-network:request', { detail: request }))
            }

            window.demoNetwork = {
                defaults,
                get settings() { return settings },
                set(patch) { Object.assign(settings, patch); save() },
                reset() { settings = Object.assign({}, defaults); save() },
                releaseHung() { hung.splice(0).forEach(release => release()) },
                get hungCount() { return hung.length },
                requests: [],
            }

            window.fetch = async function (input, init = {}) {
                let url = typeof input === 'string' ? input : input.url
                let method = String(init.method || 'GET').toUpperCase()

                if (method !== 'POST' || ! /\/update(\?|$)/.test(url)) return original(input, init)

                let mode = settings.mode
                if (mode === 'normal' && settings.failRate > 0 && Math.random() * 100 < settings.failRate) mode = 'offline'
                if (settings.once && settings.mode !== 'normal') window.demoNetwork.set({ mode: 'normal' })

                let request = { id: ++counter, mode, startedAt: Date.now(), status: 'sending' }
                window.demoNetwork.requests.unshift(request)
                record(request, {})

                let delay = Number(settings.latency) + Math.random() * Number(settings.jitter)
                await sleep(delay / 2)

                if (mode === 'offline') {
                    record(request, { status: 'dropped' })
                    throw new TypeError('Failed to fetch (simulated: request dropped before reaching the server)')
                }

                if (mode === 'error') {
                    await sleep(delay / 2)
                    record(request, { status: '500' })
                    return new Response('<h1>Simulated server error</h1>', { status: 500, headers: { 'Content-Type': 'text/html' } })
                }

                if (mode === 'hang') {
                    record(request, { status: 'hanging' })
                    await new Promise(resolve => hung.push(resolve))
                    record(request, { status: 'dropped' })
                    throw new TypeError('Failed to fetch (simulated: hung request released)')
                }

                let response = await original(input, init)
                await sleep(delay / 2)

                if (mode === 'lost') {
                    record(request, { status: 'lost' })
                    throw new TypeError('Failed to fetch (simulated: server handled it, response lost)')
                }

                record(request, { status: String(response.status) })
                return response
            }
        })()

        function demoPhase(entry) {
            if (entry.status === 'failed') return 'failed'
            if (entry.status === 'awaiting') return 'awaiting listener'
            if (entry.gates.includes('undo')) return 'undo window'
            if (entry.gates.length) return 'waiting'
            if (entry.linked) return 'linked'
            return entry.sent ? 'in flight' : 'queued'
        }

        function demoCall(entry) {
            return entry.method + '(' + entry.params.map(param => JSON.stringify(param)).join(', ') + ')'
        }
    </script>

    <style>
        :root {
            --bg: #f6f7fb; --card: #fff; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0;
            --accent: #4f46e5; --accent-soft: #eef2ff;
            --pending: #d97706; --pending-soft: #fffbeb; --failed: #dc2626; --failed-soft: #fef2f2;
            --ok: #059669; --ok-soft: #ecfdf5; --held: #2563eb; --held-soft: #eff6ff;
        }
        * { box-sizing: border-box; }
        body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
        code, pre { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
        h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.02em; }
        h2 { font-size: 16px; margin: 0; }
        h3 { font-size: 12px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
        button { font: inherit; }

        .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; max-width: 1500px; margin: 0 auto; padding: 24px; }
        @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } .sidebar { position: static !important; } }
        .intro { grid-column: 1 / -1; display: grid; gap: 14px; }
        .intro p { margin: 0; color: var(--muted); max-width: 780px; }
        .legend { display: flex; flex-wrap: wrap; gap: 10px; }
        .legend span { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); font-size: 12px; }
        .swatch { width: 12px; height: 12px; border-radius: 3px; }

        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 18px; align-content: start; }
        @media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
        .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; display: grid; gap: 12px; align-content: start; box-shadow: 0 1px 2px rgb(15 23 42 / .04); }
        .card-head { display: flex; align-items: center; gap: 10px; }
        .num { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; }
        .teaches { margin: 0; color: var(--muted); }
        .code { margin: 0; padding: 10px 12px; background: #0f172a; color: #e2e8f0; border-radius: 10px; overflow-x: auto; white-space: pre; }

        .panes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 640px) { .panes { grid-template-columns: 1fr; } }
        .panes:has(> .pane:only-child) { grid-template-columns: 1fr; }
        .pane { border: 1px dashed var(--line); border-radius: 10px; padding: 10px; display: grid; gap: 8px; align-content: start; min-width: 0; }
        .pane-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }

        .btn { border: 1px solid var(--line); background: var(--card); padding: 6px 12px; border-radius: 8px; cursor: pointer; transition: background .15s, border-color .15s, opacity .15s; }
        .btn:hover { border-color: #cbd5e1; }
        .btn:disabled { opacity: .4; cursor: default; }
        .btn.small { padding: 2px 8px; font-size: 12px; }
        .btn.ghost { border-color: transparent; background: transparent; color: var(--muted); }
        .btn.ghost:hover { background: var(--bg); color: var(--ink); }
        .btn.is-on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .like.is-on { background: #e11d48; border-color: #e11d48; }
        .link { border: 0; background: none; padding: 0; color: var(--accent); cursor: pointer; text-decoration: underline; }

        .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .row { display: flex; flex-wrap: wrap; min-width: 0; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); transition: background .2s, border-color .2s, opacity .2s; }
        .row label { display: flex; align-items: center; gap: 8px; flex: 1; }
        .column-row { flex-wrap: wrap; }
        .grow { flex: 1; min-width: 0; }
        .is-done span { text-decoration: line-through; color: var(--muted); }
        .unread { font-weight: 600; }
        .tag { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--pending); background: var(--pending-soft); padding: 1px 6px; border-radius: 999px; }
        .status { font-size: 12px; color: var(--pending); }
        .error { color: var(--failed); font-size: 12px; margin: 0; }
        .error:empty { display: none; }
        .full { flex-basis: 100%; }
        .muted { color: var(--muted); }
        .input { flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; font: inherit; }
        .add { display: flex; gap: 8px; }
        .add input { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font: inherit; }
        .row-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; }

        /* Optimistic states, applied by wire:optimistic.class(.failed) */
        .opt-pending { border-color: var(--pending) !important; background: repeating-linear-gradient(-45deg, var(--pending-soft), var(--pending-soft) 6px, #fff 6px, #fff 12px) !important; }
        .opt-failed { border-color: var(--failed) !important; background: var(--failed-soft) !important; }
        .opt-pending-text { color: var(--pending); font-weight: 700; }
        .shake { animation: shake .35s; }
        @keyframes shake { 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
        body.highlight [data-optimistic="pending"] { outline: 2px dashed var(--pending); outline-offset: 2px; }
        body.highlight [data-optimistic="failed"] { outline: 2px solid var(--failed); outline-offset: 2px; }

        .entries { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 4px; }
        .entries-head { display: flex; justify-content: space-between; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
        .entries-empty { font-size: 12px; color: var(--muted); }
        .entry { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; padding: 4px 8px; border-radius: 6px; background: var(--pending-soft); }
        .entry code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
        .entry .phase { margin-left: auto; font-weight: 600; color: var(--pending); }
        .entry[data-phase="failed"] { background: var(--failed-soft); } .entry[data-phase="failed"] .phase { color: var(--failed); }
        .entry[data-phase="undo window"], .entry[data-phase="waiting"], .entry[data-phase="queued"] { background: var(--held-soft); }
        .entry[data-phase="undo window"] .phase, .entry[data-phase="waiting"] .phase, .entry[data-phase="queued"] .phase { color: var(--held); }
        .entry-error { color: var(--failed); flex-basis: 100%; }

        .truth { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
        .truth-item { display: inline-flex; gap: 8px; padding: 3px 8px; border-radius: 6px; background: var(--bg); color: var(--muted); }
        .truth-label { color: var(--ink); font-weight: 600; }
        .truth b { color: var(--ink); font-family: ui-monospace, monospace; }

        .toast { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 10px; background: var(--ink); color: #fff; }
        .toast .btn { color: var(--ink); }
        .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .column { background: var(--bg); border-radius: 8px; padding: 6px; min-height: 80px; }
        .card-item { font-size: 12px; padding: 4px; gap: 2px; }
        .card-item .btn.small { padding: 2px 4px; flex: none; }
        .card-item .grow { overflow-wrap: anywhere; }
        .chat { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .msg { display: flex; gap: 8px; align-items: flex-start; padding: 6px; border: 1px solid transparent; border-radius: 8px; }
        .msg p { margin: 0; }
        .avatar { width: 22px; height: 22px; border-radius: 999px; flex: none; }
        .product { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; }
        .qty { min-width: 22px; text-align: center; font-weight: 600; }
        .vote { position: relative; display: flex; align-items: center; gap: 8px; width: 100%; border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 6px 10px; cursor: pointer; overflow: hidden; text-align: left; }
        .vote .bar { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); z-index: 0; transition: width .3s; }
        .vote > *:not(.bar) { position: relative; }
        .vote.is-on { border-color: var(--accent); }
        .nav-badge { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .badge-count { background: #e11d48; color: #fff; border-radius: 999px; padding: 0 8px; font-size: 12px; font-weight: 700; }
        .profile { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .avatar-upload { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .avatar-lg { width: 64px; height: 64px; border-radius: 999px; object-fit: cover; border: 2px solid var(--line); }
        .dot { width: 12px; height: 12px; border-radius: 999px; flex: none; }
        .toggle { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 6px; border: 1px solid transparent; }
        .two-lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .timer { display: flex; align-items: center; gap: 12px; }
        .clock { font: 600 22px ui-monospace, monospace; min-width: 90px; }
        .pin { width: 18px; }

        .sidebar { position: sticky; top: 24px; align-self: start; display: grid; gap: 16px; max-height: calc(100vh - 48px); overflow: auto; }
        .panel { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 10px; }
        .field { display: grid; gap: 4px; }
        .field label { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
        .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .modes button { text-align: left; padding: 6px 8px; font-size: 12px; }
        .modes button.is-on { background: var(--ink); border-color: var(--ink); color: #fff; }
        .modes small { display: block; opacity: .7; font-size: 11px; }
        .log { display: grid; gap: 3px; font-size: 12px; max-height: 360px; overflow: auto; }
        .log-row { display: grid; grid-template-columns: 52px 92px 1fr; gap: 6px; padding: 2px 4px; border-radius: 4px; }
        .log-row time { color: var(--muted); font-variant-numeric: tabular-nums; }
        .log-type { font-weight: 600; }
        .log-row[data-type="confirmed"] .log-type { color: var(--ok); }
        .log-row[data-type="failed"] .log-type { color: var(--failed); }
        .log-row[data-type="rolled-back"] .log-type { color: var(--failed); }
        .log-row[data-type="added"] .log-type, .log-row[data-type="sent"] .log-type { color: var(--pending); }
        .log-row[data-type="request"] .log-type { color: var(--held); }
        .log-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    </style>
</head>
<body x-data="{ highlight: true }" :class="highlight && 'highlight'">
    <div class="layout">
        <div class="intro">
            <div>
                <h1>Livewire Optimistic UI</h1>
                <p>Every card is a separate Livewire component. Each one is rendered twice from the same component: once in Blade with <code>@@foreach</code> (server rendered rows) and once in Alpine with <code>x-for</code> (rendered from <code>$wire</code> data). Act in one pane and watch both. Slow the network down or break it in the panel on the right to see pending, failed and rolled back states.</p>
            </div>
            <div class="legend">
                <span><i class="swatch" style="background: repeating-linear-gradient(-45deg, var(--pending-soft), var(--pending-soft) 3px, var(--pending) 3px, var(--pending) 4px)"></i> pending (shown before the server confirmed)</span>
                <span><i class="swatch" style="background: var(--failed)"></i> failed / rolled back</span>
                <span><i class="swatch" style="background: var(--held)"></i> held back (undo window, queued, waiting for a create)</span>
                <span><i class="swatch" style="background: var(--ok)"></i> confirmed (server state takes over)</span>
            </div>
        </div>

        <main class="cards">
            <livewire:demo.like-button />
            <livewire:demo.todo-checklist />
            <livewire:demo.todo-add />
            <livewire:demo.undo-delete />
            <livewire:demo.inline-rename />
            <livewire:demo.pin-notes />
            <livewire:demo.kanban />
            <livewire:demo.chat />
            <livewire:demo.cart />
            <livewire:demo.poll />
            <livewire:demo.notification-list />
            <livewire:demo.bulk-archive />
            <livewire:demo.dismiss-suggestions />
            <livewire:demo.duplicate-pages />
            <livewire:demo.follow-button />
            <livewire:demo.avatar-upload />
            <livewire:demo.assign-issue />
            <livewire:demo.settings-toggles />
            <livewire:demo.restore-trash />
            <livewire:demo.timer />
        </main>

        <aside class="sidebar">
            <section class="panel" x-data="{
                settings: { ...demoNetwork.settings },
                modes: [
                    ['normal', 'Normal', 'requests succeed'],
                    ['offline', 'Request dropped', 'never reaches the server'],
                    ['lost', 'Lost response', 'server ran it, answer lost'],
                    ['error', 'Server error', 'HTTP 500'],
                    ['hang', 'Hang', 'no answer until released'],
                ],
                update(patch) { demoNetwork.set(patch); this.settings = { ...demoNetwork.settings } },
            }" @demo-network:change.window="settings = { ...demoNetwork.settings }" data-test="network-panel">
                <h3>Simulated network</h3>
                <div class="field">
                    <label>Latency <b x-text="settings.latency + ' ms'"></b></label>
                    <input type="range" min="0" max="5000" step="100" :value="settings.latency" @input="update({ latency: +$el.value })" data-test="latency">
                </div>
                <div class="field">
                    <label>Jitter (random extra) <b x-text="settings.jitter + ' ms'"></b></label>
                    <input type="range" min="0" max="3000" step="100" :value="settings.jitter" @input="update({ jitter: +$el.value })">
                </div>
                <div class="field">
                    <label>Random failures <b x-text="settings.failRate + '%'"></b></label>
                    <input type="range" min="0" max="100" step="5" :value="settings.failRate" @input="update({ failRate: +$el.value })">
                </div>
                <div class="modes">
                    <template x-for="[mode, label, hint] in modes" :key="mode">
                        <button class="btn" :class="settings.mode === mode && 'is-on'" @click="update({ mode })" :data-test="'mode-' + mode">
                            <span x-text="label"></span><small x-text="hint"></small>
                        </button>
                    </template>
                </div>
                <label class="check"><input type="checkbox" :checked="settings.once" @change="update({ once: $el.checked })"> Only break the next request</label>
                <button class="btn small" @click="demoNetwork.releaseHung()">Release hung requests</button>
                <label class="check"><input type="checkbox" x-model="highlight"> <span>Outline elements with <code>data-optimistic</code></span></label>
                <form method="post" action="{{ route('demo.reset') }}">
                    @csrf
                    <button class="btn small">Reset demo data</button>
                </form>
            </section>

            <section class="panel" x-data="{
                rows: [],
                push(row) { this.rows.unshift({ ...row, id: Math.random(), at: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) }); this.rows = this.rows.slice(0, 80) },
            }"
                @optimistic:event.window="push({ type: $event.detail.type, text: $event.detail.entry.component + ' · ' + demoCall($event.detail.entry) + ($event.detail.error ? ' · ' + $event.detail.error : '') })"
                @demo-network:request.window="$event.detail.status !== 'sending' && push({ type: 'request', text: '#' + $event.detail.id + ' ' + $event.detail.status + ($event.detail.mode !== 'normal' ? ' (' + $event.detail.mode + ')' : '') })"
                data-test="event-log">
                <div class="row-between"><h3>Event log</h3><button class="btn small ghost" @click="rows = []">Clear</button></div>
                <div class="log">
                    <template x-for="row in rows" :key="row.id">
                        <div class="log-row" :data-type="row.type">
                            <time x-text="row.at"></time>
                            <span class="log-type" x-text="row.type"></span>
                            <code x-text="row.text" :title="row.text"></code>
                        </div>
                    </template>
                    <span class="muted" x-show="! rows.length">Interact with any card…</span>
                </div>
            </section>
        </aside>
    </div>
</body>
</html>
