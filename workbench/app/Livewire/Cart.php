<?php

namespace Workbench\App\Livewire;

use Capevace\OptimisticUI\Optimistic;
use Livewire\Component;
use Workbench\App\Models\Kv;
use Workbench\App\Models\Product;

class Cart extends Component
{
    public array $quantities = [];

    public array $products = [];

    public function mount(): void
    {
        $this->products = Product::orderBy('id')->get(['id', 'name', 'stock'])->toArray();
        $this->quantities = $this->stored();
    }

    #[Optimistic('$wire.quantities[productId] = Math.max(0, ($wire.quantities[productId] ?? 0) + delta)')]
    public function adjust(int $productId, int $delta): void
    {
        $product = Product::findOrFail($productId);
        $quantities = $this->stored();
        $next = max(0, ($quantities[$productId] ?? 0) + $delta);

        if ($next > $product->stock) {
            Optimistic::reject("Only {$product->stock} {$product->name} left.");
        }

        $quantities[$productId] = $next;
        Kv::put('cart', $quantities);
        $this->quantities = $quantities;
    }

    protected function stored(): array
    {
        $stored = Kv::get('cart', []);

        return collect($this->products)->mapWithKeys(fn ($product) => [$product['id'] => (int) ($stored[$product['id']] ?? 0)])->all();
    }

    public function render()
    {
        return view('livewire.cart');
    }
}
