<?php

namespace Workbench\App\Providers;

use Illuminate\Support\ServiceProvider;
use Livewire\Livewire;
use Workbench\App\Livewire as Demo;

class WorkbenchServiceProvider extends ServiceProvider
{
    public const COMPONENTS = [
        'demo.like-button' => Demo\LikeButton::class,
        'demo.todo-checklist' => Demo\TodoChecklist::class,
        'demo.todo-add' => Demo\TodoAdd::class,
        'demo.undo-delete' => Demo\UndoDelete::class,
        'demo.inline-rename' => Demo\InlineRename::class,
        'demo.pin-notes' => Demo\PinNotes::class,
        'demo.kanban' => Demo\Kanban::class,
        'demo.chat' => Demo\Chat::class,
        'demo.cart' => Demo\Cart::class,
        'demo.poll' => Demo\Poll::class,
        'demo.notification-list' => Demo\NotificationList::class,
        'demo.nav-badge' => Demo\NavBadge::class,
        'demo.bulk-archive' => Demo\BulkArchive::class,
        'demo.dismiss-suggestions' => Demo\DismissSuggestions::class,
        'demo.duplicate-pages' => Demo\DuplicatePages::class,
        'demo.follow-button' => Demo\FollowButton::class,
        'demo.avatar-upload' => Demo\AvatarUpload::class,
        'demo.assign-issue' => Demo\AssignIssue::class,
        'demo.settings-toggles' => Demo\SettingsToggles::class,
        'demo.restore-trash' => Demo\RestoreTrash::class,
        'demo.timer' => Demo\Timer::class,
    ];

    public function boot(): void
    {
        foreach (self::COMPONENTS as $name => $class) {
            Livewire::component($name, $class);
        }
    }
}
