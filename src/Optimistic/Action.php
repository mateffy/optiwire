<?php

namespace Capevace\OptimisticUI\Optimistic;

use Livewire\Attribute;
use ReflectionParameter;

/**
 * Base class of every method level optimistic attribute. A method may carry
 * several of them (e.g. Delete from one list + Create in another); their
 * options are merged and their ops run in declaration order.
 */
abstract class Action extends Attribute
{
    public function __construct(
        public ?string $dispatch = null,
        public bool $squash = false,
        public bool $retry = false,
        public int|float $undo = 0,
        public ?int $timeout = null,
    ) {}

    /**
     * @param  array<int, ReflectionParameter>  $parameters
     */
    abstract public function toOp(array $parameters): ?array;

    public function options(): array
    {
        return array_filter([
            'dispatch' => $this->dispatch,
            'squash' => $this->squash ?: null,
            'retry' => $this->retry ?: null,
            'undo' => $this->undo ?: null,
            'timeout' => $this->timeout,
        ], fn ($value) => $value !== null);
    }

    /**
     * Name of the parameter holding the item key: an explicit `key:`, a
     * parameter marked #[Key], or a conventionally named one.
     *
     * @param  array<int, ReflectionParameter>  $parameters
     */
    protected function keyParameter(array $parameters, ?string $explicit, array $conventions): ?string
    {
        $names = array_map(fn (ReflectionParameter $parameter) => $parameter->getName(), $parameters);

        if ($explicit !== null) {
            return in_array($explicit, $names, true) ? $explicit : throw new \InvalidArgumentException("Optimistic key parameter [{$explicit}] does not exist.");
        }

        foreach ($parameters as $parameter) {
            if ($parameter->getAttributes(Key::class) !== []) {
                return $parameter->getName();
            }
        }

        foreach ($conventions as $convention) {
            if (in_array($convention, $names, true)) {
                return $convention;
            }
        }

        return null;
    }
}
