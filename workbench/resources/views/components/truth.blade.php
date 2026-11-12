@props(['paths'])

<div class="truth" x-data>
    @foreach ($paths as $label => $path)
        <span class="truth-item">
            <span class="truth-label">{{ $label }}</span>
            <span>server <b x-text="JSON.stringify($optimistic.server('{{ $path }}'))"></b></span>
            <span>screen <b x-text="JSON.stringify($wire.$get('{{ $path }}'))"></b></span>
        </span>
    @endforeach
</div>
