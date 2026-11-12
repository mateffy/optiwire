<?php

namespace Capevace\OptimisticUI\Optimistic;

use Attribute;

/**
 * Marks the parameter that holds the item key, when it isn't named `id`.
 * For creates this is also where the client generated key is passed.
 */
#[Attribute(Attribute::TARGET_PARAMETER)]
class Key {}
