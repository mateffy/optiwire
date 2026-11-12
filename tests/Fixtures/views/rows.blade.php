<ul>
    @foreach ($items as $item)
        <li @optirow($item, ['title', 'meta.label', 'missing'])></li>
    @endforeach
</ul>
