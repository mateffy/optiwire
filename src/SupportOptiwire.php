<?php

namespace Mateffy\Optiwire;

use Mateffy\Optiwire\Optimistic\Action;
use Mateffy\Optiwire\Optimistic\Defaults;
use Mateffy\Optiwire\Optimistic\Expose;
use Mateffy\Optiwire\Optimistic\On;
use Mateffy\Optiwire\Optimistic\Ordered;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use JsonSerializable;
use Livewire\ComponentHook;
use Livewire\Features\SupportAttributes\AttributeLevel;
use Livewire\Features\SupportScriptsAndAssets\SupportScriptsAndAssets;
use ReflectionMethod;

use function Livewire\on;

class SupportOptiwire extends ComponentHook
{
    /**
     * The optimistic action currently being executed: ['id' => ..., 'key' => ...].
     */
    public static ?array $current = null;

    public static function provide(): void
    {
        on('flush-state', function () {
            static::$current = null;
        });
    }

    public function call($method, $params, $returnEarly, $metadata, $componentContext)
    {
        $meta = $metadata['optimistic'] ?? null;

        if (! is_array($meta) || ! is_string($meta['id'] ?? null) || ! Str::isUuid($meta['id'])) {
            return null;
        }

        $actionId = $meta['id'];
        $injected = $meta['injected'] ?? null;
        $key = null;

        if (is_int($injected)) {
            $key = $params[$injected] ?? null;

            // The client fills in keys of created items. Only accept something
            // that looks like what our client generates.
            if (! is_string($key) || ! Str::isUuid($key)) {
                $this->rejectAction($actionId, 'Invalid client generated key.');
                $returnEarly(null);

                return null;
            }
        }

        // Retries of a request whose response got lost would run the action
        // twice. Remember what we've already done.
        $cacheKey = $this->idempotencyKey($actionId);

        if ($cacheKey !== null && $this->cache()->has($cacheKey)) {
            $returnEarly($this->cache()->get($cacheKey)['return'] ?? null);

            return null;
        }

        static::$current = ['id' => $actionId, 'key' => $key];

        return function ($return = null) use ($actionId, $cacheKey) {
            static::$current = null;

            if ($cacheKey === null || $this->isRejected($actionId)) {
                return;
            }

            $this->cache()->put($cacheKey, [
                'return' => is_scalar($return) || is_array($return) ? $return : null,
            ], (int) config('optiwire.idempotency.ttl', 600));
        };
    }

    public function exception($e, $stopPropagation)
    {
        $current = static::$current;

        if ($current === null) {
            return;
        }

        if ($e instanceof OptimisticRejection) {
            $this->rejectAction($current['id'], $e->getMessage());
            $stopPropagation();
        } elseif ($e instanceof ValidationException) {
            $this->rejectAction($current['id'], collect($e->errors())->flatten()->first() ?? $e->getMessage());
        } else {
            static::$current = null;
        }
    }

    public function dehydrate($context)
    {
        $config = static::configFor($this->component);

        if ($config === null) {
            return;
        }

        $context->addMemo('optimistic', $config);

        if ($this->storeHas('optimistic-rejected')) {
            $context->addEffect('optimistic', ['rejected' => $this->storeGet('optimistic-rejected')]);
        }

        if (config('optiwire.inject_assets', true)) {
            SupportScriptsAndAssets::$renderedAssets['optiwire'] = static::scriptTag();
        }
    }

    protected function rejectAction(string $actionId, string $message): void
    {
        $this->storePush('optimistic-rejected', $message, $actionId);
    }

    protected function isRejected(string $actionId): bool
    {
        return array_key_exists($actionId, $this->storeGet('optimistic-rejected', []));
    }

    protected function idempotencyKey(string $actionId): ?string
    {
        if (! config('optiwire.idempotency.enabled', true)) {
            return null;
        }

        $session = app()->bound('session') && session()->isStarted() ? session()->getId() : 'stateless';

        return 'optiwire:'.hash('sha256', $session.'|'.$this->component->getName().'|'.$actionId);
    }

    protected function cache()
    {
        return Cache::store(config('optiwire.idempotency.store'));
    }

    public static function scriptTag(): string
    {
        $path = static::scriptPath();
        $version = substr(md5((string) filemtime($path)), 0, 8);
        $url = url(config('optiwire.route', 'optiwire/optiwire.js')).'?v='.$version;
        $client = json_encode((object) config('optiwire.client', []), JSON_HEX_TAG);

        return "<script>window.optimisticConfig = Object.assign({$client}, window.optimisticConfig || {})</script>\n"
            ."<script src=\"{$url}\" data-navigate-once></script>";
    }

    public static function scriptPath(): string
    {
        return dirname(__DIR__).'/dist/optimistic.js';
    }

    /**
     * Builds the client side configuration of a component, or null when the
     * component doesn't use any optimistic feature.
     */
    public static function configFor($component): ?array
    {
        $attributes = $component->getAttributes();

        $actions = [];
        $lists = [];
        $listeners = [];
        $data = [];

        foreach ($attributes->whereInstanceOf(Action::class)->groupBy(fn (Action $attribute) => $attribute->getName()) as $method => $group) {
            $actions[$method] = static::actionConfig(new ReflectionMethod($component, $method), $group->all());
        }

        foreach ($attributes->whereInstanceOf(Ordered::class) as $ordered) {
            $lists[$ordered->listName()] = $ordered->toSpec();
        }

        foreach ($attributes->whereInstanceOf(Defaults::class) as $defaults) {
            $lists[$defaults->list] ??= ['key' => 'id'];
            $values = static::serialize($component->{$defaults->getName()}());

            if (is_array($values) && $values !== []) {
                $lists[$defaults->list]['defaults'] = $values;
            }
        }

        foreach ($attributes->whereInstanceOf(On::class) as $listener) {
            $listeners[$listener->event][] = $listener->js;
        }

        foreach ($attributes->whereInstanceOf(Expose::class) as $expose) {
            $name = $expose->getName();
            $data[$expose->as ?? $name] = static::serialize($component->{$name});
        }

        if ($actions === [] && $lists === [] && $listeners === [] && $data === []) {
            return null;
        }

        // Livewire checksums the memo and re-checks it after a JSON round
        // trip, where {} would come back as []. So: no empty objects.
        return array_filter([
            'actions' => $actions ?: null,
            'lists' => $lists ?: null,
            'listeners' => $listeners ?: null,
            'data' => $data ?: null,
        ], fn ($value) => $value !== null);
    }

    /**
     * @param  array<int, Action>  $attributes
     */
    protected static function actionConfig(ReflectionMethod $method, array $attributes): array
    {
        $parameters = $method->getParameters();
        $names = array_map(fn ($parameter) => $parameter->getName(), $parameters);

        $config = ['params' => $names, 'inject' => null, 'key' => null, 'ops' => []];

        foreach ($attributes as $attribute) {
            $config = array_merge($config, $attribute->options());

            if (($op = $attribute->toOp($parameters)) === null) {
                continue;
            }

            $config['ops'][] = $op;

            if ($op['type'] === 'create' && $op['key'] !== null) {
                $config['key'] ??= $op['key'];

                // A create whose key is also its source ("move") uses an
                // existing key, nothing to generate.
                if ($op['from'] !== $op['key']) {
                    $config['inject'] ??= array_search($op['key'], $names, true);
                }
            }
        }

        return $config;
    }

    public static function serialize(mixed $value): mixed
    {
        if ($value instanceof Arrayable) {
            return $value->toArray();
        }

        if ($value instanceof JsonSerializable) {
            return $value->jsonSerialize();
        }

        return $value;
    }

    /**
     * Fields Blade rows need to carry for the lists of a component.
     */
    public static function rowFieldsFor($component): array
    {
        if ($component === null) {
            return [];
        }

        return $component->getAttributes()
            ->whereInstanceOf(Ordered::class)
            ->flatMap(fn (Ordered $ordered) => $ordered->rowFields())
            ->unique()
            ->values()
            ->all();
    }

    public static function keyFieldFor($component): string
    {
        return $component?->getAttributes()->whereInstanceOf(Ordered::class)->first()?->key ?? 'id';
    }
}
