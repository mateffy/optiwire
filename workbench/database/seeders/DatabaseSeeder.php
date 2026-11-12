<?php

namespace Workbench\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Workbench\App\Models;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['tasks', 'notes', 'cards', 'messages', 'products', 'poll_options', 'notifications_demo', 'emails', 'suggestions', 'pages', 'people', 'issues', 'files', 'kv'] as $table) {
            DB::table($table)->delete();
        }

        $time = now()->subHour();
        $at = function () use (&$time) {
            return $time = $time->copy()->addMinute();
        };

        foreach (['Water the plants', 'Reply to Sam', 'Book flights'] as $text) {
            Models\Task::create(['bucket' => 'checklist', 'text' => $text, 'created_at' => $at()]);
        }

        foreach (['Write the changelog' => false, 'Fix the flaky test' => false, 'Review PR #42' => true] as $text => $done) {
            Models\Task::create(['bucket' => 'add', 'text' => $text, 'done' => $done, 'created_at' => $at()]);
        }

        foreach (['Old draft', 'Duplicate invoice', 'Spam signup', 'Stale branch'] as $text) {
            Models\Task::create(['bucket' => 'undo', 'text' => $text, 'created_at' => $at()]);
        }

        foreach (['Groceries', 'Quarterly report'] as $text) {
            Models\Task::create(['bucket' => 'rename', 'text' => $text, 'created_at' => $at()]);
        }

        foreach (['Meeting notes' => false, 'Ideas' => true, 'Packing list' => false, 'Recipes' => false] as $title => $pinned) {
            Models\Note::create(['title' => $title, 'pinned' => $pinned]);
        }

        $position = 0;
        foreach (['todo' => ['Design the API', 'Write docs'], 'doing' => ['Build the plugin'], 'done' => ['Read the Livewire source']] as $column => $titles) {
            foreach ($titles as $title) {
                Models\Card::create(['title' => $title, 'column' => $column, 'position' => ++$position]);
            }
        }

        Models\Message::create(['body' => 'Hey! Did the deploy go out?', 'author' => 'Sam', 'avatar' => '#f59e0b', 'sent_at' => $at()]);
        Models\Message::create(['body' => 'Yes, ten minutes ago.', 'author' => 'You', 'avatar' => '#6366f1', 'sent_at' => $at()]);

        Models\Product::create(['name' => 'Coffee beans', 'stock' => 3]);
        Models\Product::create(['name' => 'Mugs', 'stock' => 10]);

        foreach (['Tabs' => 12, 'Spaces' => 9, 'Whatever the formatter does' => 17] as $label => $votes) {
            Models\PollOption::create(['label' => $label, 'votes' => $votes]);
        }

        foreach (['New comment on your post', 'Deploy finished', 'Sam mentioned you'] as $title) {
            Models\DemoNotification::create(['title' => $title]);
        }

        foreach (['Your invoice', 'Weekly newsletter', 'Meeting moved', 'Password reset', 'Lunch?'] as $subject) {
            Models\Email::create(['subject' => $subject]);
        }

        foreach (['Connect your calendar', 'Invite a teammate', 'Try dark mode'] as $title) {
            Models\Suggestion::create(['title' => $title]);
        }

        foreach (['Pricing', 'About us', 'Changelog'] as $title) {
            Models\Page::create(['title' => $title]);
        }

        $people = collect([['Ada', '#ec4899', 1203], ['Grace', '#14b8a6', 87], ['Linus', '#f97316', 4]])
            ->map(fn ($person) => Models\Person::create(['name' => $person[0], 'color' => $person[1], 'followers' => $person[2]]));

        Models\Issue::create(['title' => 'Login is slow', 'assignee_id' => $people[0]->id]);
        Models\Issue::create(['title' => 'Typo on pricing page', 'assignee_id' => $people[1]->id]);

        foreach (['budget.xlsx', 'logo.svg'] as $name) {
            Models\File::create(['name' => $name]);
        }

        foreach (['old-notes.txt', 'draft-v1.docx'] as $name) {
            Models\File::create(['name' => $name])->delete();
        }

        Models\Kv::put('post', ['likes' => 41, 'liked' => false]);
        Models\Kv::put('cart', []);
        Models\Kv::put('settings', ['email' => true, 'digest' => false, 'beta' => false]);
    }
}
