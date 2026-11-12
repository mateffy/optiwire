<div class="entries" x-data data-test="entries">
    <div class="entries-head">
        <span>Optimistic entries</span>
        <span class="count" x-text="$optimistic.entries.length"></span>
    </div>

    <template x-for="entry in $optimistic.entries" :key="entry.id">
        <div class="entry" :data-phase="demoPhase(entry)">
            <code x-text="demoCall(entry)"></code>
            <span class="phase" x-text="demoPhase(entry)"></span>
            <span class="entry-error" x-show="entry.error" x-text="entry.error"></span>
        </div>
    </template>

    <div class="entries-empty" x-show="! $optimistic.entries.length">Nothing in flight. The screen shows server state.</div>
</div>
