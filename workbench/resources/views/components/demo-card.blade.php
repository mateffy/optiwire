@props(['n', 'title', 'teaches' => null, 'blade' => null, 'alpine' => null, 'code' => null])

<section class="card" id="example-{{ $n }}" data-example="{{ $n }}">
    <header class="card-head">
        <span class="num">{{ $n }}</span>
        <h2>{{ $title }}</h2>
    </header>

    @if ($teaches)
        <p class="teaches">{{ $teaches }}</p>
    @endif

    @if ($code)
        <pre class="code">{{ trim($code) }}</pre>
    @endif

    {{ $slot }}

    <div class="panes">
        @isset($blade)
            <div class="pane" data-pane="blade">
                <div class="pane-label">Blade · <code>@@foreach</code></div>
                {{ $blade }}
            </div>
        @endisset

        @isset($alpine)
            <div class="pane" data-pane="alpine">
                <div class="pane-label">Alpine · <code>x-for</code></div>
                {{ $alpine }}
            </div>
        @endisset
    </div>

    <x-entries />
</section>
