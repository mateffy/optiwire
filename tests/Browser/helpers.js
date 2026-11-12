(() => {
    let sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    let visible = el => !! el && el.offsetParent !== null

    window.T = {
        sleep,
        card: n => document.querySelector(`[data-example="${n}"]`),
        texts: selector => [...document.querySelectorAll(selector)].filter(visible).map(el => el.innerText.replace(/\s+/g, ' ').trim()),
        visible: selector => visible(document.querySelector(selector)),
        net(patch = {}) {
            demoNetwork.set({ latency: 0, jitter: 0, mode: 'normal', once: true, failRate: 0, ...patch })
        },
        entries: () => Optimistic.store.entries.map(entry => ({ method: entry.method, status: entry.status, error: entry.error, sent: !! entry.sent })),
        requests: () => demoNetwork.requests.map(request => request.status),
        async until(check, timeout = 8000) {
            let deadline = Date.now() + timeout
            while (Date.now() < deadline) {
                try {
                    if (await check()) return true
                } catch (e) {}
                await sleep(25)
            }
            throw new Error('Timed out waiting for: ' + check.toString())
        },
        // Nothing in flight anymore: no request on the wire, no sent optimistic
        // action waiting for its answer, and the DOM work after it is done.
        async idle(timeout = 10000) {
            await sleep(30)
            await T.until(() =>
                ! demoNetwork.requests.some(request => ['sending', 'hanging'].includes(request.status))
                && ! Optimistic.store.entries.some(entry => entry.status === 'pending' && ! entry.gates.has('undo'))
                && ! Optimistic.store.entries.some(entry => entry.status === 'awaiting'), timeout)
            await sleep(60)
            return true
        },
        // Everything a component shows from $wire matches what the server said.
        consistent(n) {
            let el = T.card(n).closest('[wire\\:id]')
            let component = el.__livewire
            let api = Alpine.evaluate(el, '$optimistic')
            let keys = [...Object.keys(component.snapshot.data), ...Object.keys(component.snapshot.memo.optimistic?.data || {})]
            return keys.every(key => JSON.stringify(api.server(key)) === JSON.stringify(component.$wire[key]))
        },
        // Same, but returns the keys that differ (for readable failures).
        differences(n) {
            let el = T.card(n).closest('[wire\\:id]')
            let component = el.__livewire
            let api = Alpine.evaluate(el, '$optimistic')
            let keys = [...Object.keys(component.snapshot.data), ...Object.keys(component.snapshot.memo.optimistic?.data || {})]
            return keys.filter(key => JSON.stringify(api.server(key)) !== JSON.stringify(component.$wire[key]))
        },
    }

    return true
})()
