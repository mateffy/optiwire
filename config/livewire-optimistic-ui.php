<?php

return [
    // Inject the client script automatically on pages using optimistic features.
    'inject_assets' => true,

    // Where the client script is served from.
    'route' => 'livewire-optimistic-ui/optimistic.js',

    // Remember finished optimistic actions, so retrying a request whose
    // response got lost doesn't run the action twice.
    'idempotency' => [
        'enabled' => true,
        'ttl' => 600,
        'store' => null,
    ],

    // Passed to the client as window.optimisticConfig.
    'client' => [
        'timeout' => 30000,
        'warnOnUnload' => true,
        'linkTimeout' => 5000,
        'failedTtl' => 0,
    ],
];
