<div>
<x-demo-card n="9" title="Cart quantity with a stock limit" teaches="The request succeeds, but the answer is no: Optimistic::reject() rolls the change back and the message shows next to the product whose button was clicked.">
    <x-slot:code>
#[Optimistic('$wire.quantities[productId] = Math.max(0, ($wire.quantities[productId] ?? 0) + delta)')]
public function adjust(int $productId, int $delta) { … Optimistic::reject("Only 3 left.") … }
    </x-slot:code>

    <x-slot:blade>
        @foreach ($products as $product)
            <div class="product" wire:optimistic.class.failed="shake" data-test="blade-product-{{ $product['id'] }}">
                <span class="grow">{{ $product['name'] }} <small>({{ $product['stock'] }} in stock)</small></span>
                <button class="btn small" wire:click="adjust({{ $product['id'] }}, -1)">−</button>
                <span class="qty" wire:text="quantities[{{ $product['id'] }}]" wire:optimistic.class="opt-pending-text">{{ $quantities[$product['id']] ?? 0 }}</span>
                <button class="btn small" wire:click="adjust({{ $product['id'] }}, 1)">+</button>
                <p class="error full" wire:optimistic.show.failed x-text="$optimistic.error()"></p>
            </div>
        @endforeach
    </x-slot:blade>

    <x-slot:alpine>
        <template x-for="product in $wire.products" :key="product.id">
            <div class="product" wire:optimistic.class.failed="shake">
                <span class="grow"><span x-text="product.name"></span> <small x-text="'(' + product.stock + ' in stock)'"></small></span>
                <button class="btn small" @click="$wire.adjust(product.id, -1)">−</button>
                <span class="qty" x-text="$wire.quantities[product.id]" wire:optimistic.class="opt-pending-text"></span>
                <button class="btn small" @click="$wire.adjust(product.id, 1)">+</button>
                <p class="error full" wire:optimistic.show.failed x-text="$optimistic.error()"></p>
            </div>
        </template>
    </x-slot:alpine>
</x-demo-card>
</div>
