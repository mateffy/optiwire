<ul>
    @foreach ($items as $item)
        <li @optimisticRow($item, ['title', 'meta.label', 'missing'])></li>
    @endforeach
</ul>
