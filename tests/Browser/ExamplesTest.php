<?php

// Every example of the demo page, driven through a real browser against the
// real workbench app. The network is slowed down so pending states can be
// observed, or broken in different ways to observe rollbacks.

use Workbench\App\Models;

$failures = [
    'request dropped' => ['offline', 'Network error'],
    'server error' => ['error', 'Request failed (500)'],
    'response lost' => ['lost', 'Network error'],
];

describe('1 · like button', function () use ($failures) {
    it('counts up at once and confirms', function () {
        $page = demo(['latency' => 600]);
        $page->click('[data-test=like-blade]');

        expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.texts('[data-test=likes-alpine]'), document.querySelector('[data-test=like-blade]').classList.contains('opt-pending')]"))
            ->toBe([['42'], ['42'], true]);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.entries().length, T.consistent(1)]"))->toBe([['42'], 0, true]);
        expect(Models\Kv::get('post'))->toBe(['likes' => 42, 'liked' => true]);
    });

    it('rolls back when the request fails', function (string $mode, string $error) {
        $page = demo(['mode' => $mode, 'latency' => 300]);
        $page->click('[data-test=like-alpine]');

        expect(js($page, "return T.texts('[data-test=likes-alpine]')"))->toBe(['42']);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-test=likes-blade]'), T.texts('[data-test=likes-alpine]'), document.querySelector('[data-test=like-alpine]').classList.contains('opt-failed'), T.entries()[0].error]"))
            ->toBe([['41'], ['41'], true, $error]);
    })->with($failures);

    it('ends up consistent with the server after rapid clicks on a jittery network', function () {
        $page = demo(['latency' => 200, 'jitter' => 400]);

        foreach (range(1, 5) as $click) {
            $page->click('[data-test=like-blade]');
        }

        js($page, 'await T.idle()');

        expect(js($page, 'return [T.consistent(1), T.entries().length]'))->toBe([true, 0]);
        expect(Models\Kv::get('post'))->toBe(['likes' => 42, 'liked' => true]);
    });
});

describe('2 · todo checkbox', function () {
    it('ticks both panes at once', function () {
        $page = demo(['latency' => 500]);
        $page->click('[data-example="2"] [data-test=blade-list] li:first-child input');

        expect(js($page, "return [...T.card(2).querySelectorAll('[data-test=alpine-list] input')].map(input => input.checked)"))->toBe([true, false, false]);

        js($page, 'await T.idle()');

        expect(Models\Task::where('bucket', 'checklist')->orderBy('created_at')->pluck('done')->all())->toBe([true, false, false]);
    });

    it('unticks the box again on failure', function () {
        $page = demo(['mode' => 'error', 'latency' => 300]);
        $page->click('[data-example="2"] [data-test=alpine-list] li:nth-of-type(2) input');

        js($page, 'await T.idle()');

        expect(js($page, "return [[...T.card(2).querySelectorAll('[data-test=blade-list] input')].map(input => input.checked), [...T.card(2).querySelectorAll('[data-test=alpine-list] input')].map(input => input.checked), T.card(2).querySelector('[data-test=blade-list] li:nth-child(2)').classList.contains('opt-failed')]"))
            ->toBe([[false, false, false], [false, false, false], true]);
    });
});

describe('3 · add todo', function () use ($failures) {
    it('inserts the new task where the server will put it, then adopts it', function () {
        $page = demo(['latency' => 600]);
        $page->fill('[data-test=new-task]', 'Buy milk')->keys('[data-test=new-task]', 'Enter');

        expect(js($page, "return [T.texts('[data-example=\"3\"] [data-test=blade-list] > li'), T.texts('[data-example=\"3\"] [data-test=alpine-list] > li')]"))
            ->toBe([['Buy milk NEW', 'Fix the flaky test', 'Write the changelog', 'Review PR #42'], ['Buy milk', 'Fix the flaky test', 'Write the changelog', 'Review PR #42']]);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"3\"] [data-test=blade-list] > li'), T.texts('[data-example=\"3\"] [data-test=alpine-list] > li')]"))
            ->toBe([['Buy milk', 'Fix the flaky test', 'Write the changelog', 'Review PR #42'], ['Buy milk', 'Fix the flaky test', 'Write the changelog', 'Review PR #42']]);

        expect(Models\Task::where('text', 'Buy milk')->count())->toBe(1);
    });

    it('removes the task again when the server rejects it', function () {
        $page = demo(['latency' => 300]);
        $page->fill('[data-test=new-task]', str_repeat('long ', 20))->keys('[data-test=new-task]', 'Enter');

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"3\"] [data-test=blade-list] > li').length, T.texts('[data-test=add-error]')]"))
            ->toBe([3, ['The task field must not be greater than 60 characters.']]);
    });

    it('removes the task again when the request fails', function (string $mode) {
        $page = demo(['mode' => $mode, 'latency' => 300]);
        $page->fill('[data-test=new-task]', 'Doomed')->keys('[data-test=new-task]', 'Enter');

        js($page, 'await T.idle()');

        expect(js($page, "return T.texts('[data-example=\"3\"] [data-test=blade-list] > li').length"))->toBe(3);
    })->with([['offline'], ['error']]);

    it('lets you tick a task that is still being created', function () {
        $page = demo(['latency' => 800]);
        $page->fill('[data-test=new-task]', 'Quick one')->keys('[data-test=new-task]', 'Enter');
        $page->click('[data-example="3"] [data-test=alpine-list] li:first-of-type input');

        js($page, 'await T.idle()');

        expect(Models\Task::where('text', 'Quick one')->value('done'))->toBeTrue();
        expect(js($page, "return T.texts('[data-example=\"3\"] [data-test=alpine-list] > li')"))->toBe(['Fix the flaky test', 'Write the changelog', 'Quick one', 'Review PR #42']);
    });
});

describe('4 · delete with undo', function () {
    it('undo brings the row back and nothing is sent', function () {
        $page = demo();
        $page->click('[data-example="4"] [data-test=blade-list] li:first-child button');

        expect(js($page, "return [T.texts('[data-example=\"4\"] [data-test=alpine-list] > li').length, T.visible('[data-test=undo-toast]')]"))->toBe([3, true]);

        $page->click('[data-test=undo]');

        $page->wait(5.5);

        expect(js($page, "return [T.texts('[data-example=\"4\"] [data-test=blade-list] > li').length, T.requests().length]"))->toBe([4, 0]);
        expect(Models\Task::where('bucket', 'undo')->count())->toBe(4);
    });

    it('sends the delete once the undo window closed', function () {
        $page = demo();
        $page->click('[data-example="4"] [data-test=alpine-list] li:first-of-type button');

        $page->wait(5.3);
        js($page, 'await T.idle()');

        expect(Models\Task::where('bucket', 'undo')->count())->toBe(3);
        expect(js($page, "return T.texts('[data-example=\"4\"] [data-test=blade-list] > li').length"))->toBe(3);
    });
});

describe('5 · inline rename', function () {
    it('saves the latest value only', function () {
        $page = demo(['latency' => 400]);
        $page->fill('[data-example="5"] [data-test=blade-list] li:first-child input', 'Gro');
        js($page, 'await T.sleep(450)');
        $page->fill('[data-example="5"] [data-test=blade-list] li:first-child input', 'Groceries for Sunday');

        js($page, 'await T.sleep(500); await T.idle()');

        expect(Models\Task::where('bucket', 'rename')->orderBy('created_at')->value('text'))->toBe('Groceries for Sunday');
        expect(js($page, "return [...T.card(5).querySelectorAll('[data-test=alpine-list] input')].map(input => input.value)"))->toBe(['Groceries for Sunday', 'Quarterly report']);
    });

    it('rolls back a rejected rename and shows why', function () {
        $page = demo(['latency' => 200]);
        $page->fill('[data-example="5"] [data-test=alpine-list] li:nth-of-type(2) input', '');

        js($page, 'await T.sleep(500); await T.idle()');

        expect(js($page, "return [[...T.card(5).querySelectorAll('[data-test=blade-list] input')].map(input => input.value), T.texts('[data-example=\"5\"] [data-test=blade-list] .status.error')]"))
            ->toBe([['Groceries', 'Quarterly report'], ['A task needs a name.']]);
    });
});

describe('6 · pin to top', function () {
    it('moves the note into the pinned group at once', function () {
        $page = demo(['latency' => 600]);
        $page->click('[data-example="6"] [data-test=blade-list] li:last-child button:not([style*="none"])');

        expect(js($page, "return T.texts('[data-example=\"6\"] [data-test=alpine-list] > li .grow')"))->toBe(['Ideas', 'Recipes', 'Meeting notes', 'Packing list']);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"6\"] [data-test=blade-list] > li .grow'), T.texts('[data-example=\"6\"] [data-test=blade-list] > li .pin').length]"))
            ->toBe([['Ideas', 'Recipes', 'Meeting notes', 'Packing list'], 2]);
    });

    it('moves it back when pinning fails', function () {
        $page = demo(['mode' => 'offline', 'latency' => 300]);
        $page->click('[data-example="6"] [data-test=alpine-list] li:last-child button:not([style*="none"])');

        js($page, 'await T.idle()');

        expect(js($page, "return T.texts('[data-example=\"6\"] [data-test=blade-list] > li .grow')"))->toBe(['Ideas', 'Meeting notes', 'Packing list', 'Recipes']);
    });
});

describe('7 · kanban', function () use ($failures) {
    it('moves a card to the next column at once and keeps it there', function () {
        $page = demo(['latency' => 600]);
        $page->click('[data-test=blade-column-todo] li:first-child button:last-child');

        $columns = "return ['todo', 'doing', 'done'].map(column => [T.texts('[data-test=blade-column-' + column + '] > li .grow'), T.texts('[data-test=alpine-column-' + column + '] > li .grow')])";

        expect(js($page, $columns))->toBe([
            [['Write docs'], ['Write docs']],
            [['Build the plugin', 'Design the API'], ['Build the plugin', 'Design the API']],
            [['Read the Livewire source'], ['Read the Livewire source']],
        ]);

        js($page, 'await T.idle()');

        expect(js($page, $columns))->toBe([
            [['Write docs'], ['Write docs']],
            [['Build the plugin', 'Design the API'], ['Build the plugin', 'Design the API']],
            [['Read the Livewire source'], ['Read the Livewire source']],
        ]);
        expect(Models\Card::where('title', 'Design the API')->value('column'))->toBe('doing');
    });

    it('puts the card back when the move fails', function (string $mode) {
        $page = demo(['mode' => $mode, 'latency' => 300]);
        $page->click('[data-test=alpine-column-todo] li:first-of-type button:last-child');

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-test=blade-column-todo] > li .grow'), T.texts('[data-test=blade-column-doing] > li .grow')]"))
            ->toBe([['Design the API', 'Write docs'], ['Build the plugin']]);
    })->with([['offline'], ['error']]);

    it('handles moving the same card twice before the server answers', function () {
        $page = demo(['latency' => 700]);
        $page->click('[data-test=blade-column-todo] li:first-child button:last-child');
        js($page, 'await T.sleep(50)');
        $page->click('[data-test=blade-column-doing] li:last-child button:last-child');

        js($page, 'await T.idle()');

        expect(js($page, "return ['todo', 'doing', 'done'].map(column => T.texts('[data-test=blade-column-' + column + '] > li .grow'))"))
            ->toBe([['Write docs'], ['Build the plugin'], ['Read the Livewire source', 'Design the API']]);
        expect(Models\Card::where('title', 'Design the API')->value('column'))->toBe('done');
    });
});

describe('8 · chat', function () {
    it('keeps a failed message with a retry button, and retrying never duplicates it', function () {
        $page = demo(['mode' => 'lost', 'latency' => 300]);
        $page->fill('[data-test=chat-input]', 'Did it arrive?')->keys('[data-test=chat-input]', 'Enter');

        js($page, 'await T.idle()');

        expect(js($page, "return T.texts('[data-example=\"8\"] [data-test=blade-list] > li').at(-1)"))->toBe('You Did it arrive? Not sent. Retry Discard');
        expect(Models\Message::where('body', 'Did it arrive?')->count())->toBe(1);

        $page->click('[data-test=retry]');
        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"8\"] [data-test=blade-list] > li').at(-1), T.texts('[data-example=\"8\"] [data-test=alpine-list] > li').length]"))
            ->toBe(['You Did it arrive?', 3]);
        expect(Models\Message::where('body', 'Did it arrive?')->count())->toBe(1);
    });

    it('can discard a failed message', function () {
        $page = demo(['mode' => 'offline', 'latency' => 200]);
        $page->fill('[data-test=chat-input]', 'Never mind')->keys('[data-test=chat-input]', 'Enter');

        js($page, 'await T.idle()');
        $page->click('[data-example="8"] [data-test=blade-list] li:last-of-type button:last-of-type');

        expect(js($page, "return [T.texts('[data-example=\"8\"] [data-test=blade-list] > li').length, T.entries().length]"))->toBe([2, 0]);
    });
});

describe('9 · cart', function () {
    it('rolls back what is over the stock limit and says why', function () {
        $page = demo(['latency' => 150]);

        foreach (range(1, 4) as $click) {
            $page->click('[data-example="9"] [data-pane=blade] .product:nth-child(2) button:last-of-type');
        }

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"9\"] [data-pane=blade] .product:nth-child(2) .qty'), T.texts('[data-example=\"9\"] [data-pane=blade] .product:nth-child(2) .error'), T.texts('[data-example=\"9\"] [data-pane=blade] .product:last-child .error'), T.consistent(9)]"))
            ->toBe([['3'], ['Only 3 Coffee beans left.'], [], true]);
    });
});

describe('10 · poll', function () {
    it('switches the vote, moving one count from one option to the other', function () {
        $page = demo(['latency' => 400]);
        $page->click('[data-example="10"] [data-pane=blade] .vote:nth-of-type(2)');
        js($page, 'await T.idle()');
        $page->click('[data-example="10"] [data-pane=alpine] .vote:nth-of-type(3)');

        expect(js($page, "return T.texts('[data-example=\"10\"] [data-pane=blade] .vote b')"))->toBe(['12', '9', '18']);

        js($page, 'await T.idle()');

        expect(js($page, 'return T.consistent(10)'))->toBeTrue();
        expect(Models\PollOption::orderBy('id')->pluck('votes')->all())->toBe([12, 9, 18]);
    });
});

describe('11 · notifications and a badge in another component', function () {
    it('clears the badge at once and keeps it cleared', function () {
        $page = demo(['latency' => 500]);
        $page->click('[data-test=mark-all]');

        expect(js($page, "return [T.visible('[data-test=unread]'), T.texts('[data-example=\"11\"] [data-test=blade-list] > li.unread').length]"))->toBe([false, 0]);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.visible('[data-test=unread]'), T.entries().length]"))->toBe([false, 0]);
        expect(Models\DemoNotification::whereNull('read_at')->count())->toBe(0);
    });

    it('brings the badge back when marking fails', function () {
        $page = demo(['mode' => 'error', 'latency' => 300]);
        $page->click('[data-test=mark-all]');

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-test=unread]'), T.texts('[data-example=\"11\"] [data-test=blade-list] > li.unread').length]"))->toBe([['3'], 3]);
    });

    it('counts single reads down', function () {
        $page = demo(['latency' => 300]);
        $page->click('[data-example="11"] [data-test=blade-list] li:first-child button');

        expect(js($page, "return T.texts('[data-test=unread]')"))->toBe(['2']);

        js($page, 'await T.idle()');
        expect(js($page, "return T.texts('[data-test=unread]')"))->toBe(['2']);
    });
});

describe('12 · bulk archive', function () {
    it('archives the selection together and brings it back together on failure', function () {
        $page = demo(['latency' => 300, 'mode' => 'offline']);
        $page->click('[data-example="12"] [data-test=blade-list] li:nth-child(1) input');
        $page->click('[data-example="12"] [data-test=alpine-list] li:nth-of-type(3) input');
        $page->click('[data-test=archive]');

        expect(js($page, "return T.texts('[data-example=\"12\"] [data-test=blade-list] > li')"))->toBe(['Weekly newsletter', 'Password reset', 'Lunch?']);

        js($page, 'await T.idle()');
        expect(js($page, "return T.texts('[data-example=\"12\"] [data-test=blade-list] > li').length"))->toBe(5);

        js($page, "T.net()");
        $page->click('[data-example="12"] [data-test=blade-list] li:nth-child(2) input');
        $page->click('[data-test=archive]');
        js($page, 'await T.idle()');

        expect(Models\Email::where('archived', true)->pluck('subject')->all())->toBe(['Weekly newsletter']);
    });
});

describe('13 · dismiss', function () use ($failures) {
    it('hides the row until the server agrees', function () {
        $page = demo(['latency' => 400]);
        $page->click('[data-example="13"] [data-test=alpine-list] li:first-of-type button');

        expect(js($page, "return T.texts('[data-example=\"13\"] [data-test=alpine-list] > li').length"))->toBe(2);

        js($page, 'await T.idle()');
        expect(js($page, "return [T.texts('[data-example=\"13\"] [data-test=blade-list] > li').length, T.texts('[data-example=\"13\"] [data-test=alpine-list] > li').length]"))->toBe([2, 2]);
    });

    it('brings it back when dismissing fails', function (string $mode) {
        $page = demo(['mode' => $mode, 'latency' => 300]);
        $page->click('[data-example="13"] [data-test=blade-list] li:first-child button');

        js($page, 'await T.idle()');
        expect(js($page, "return T.texts('[data-example=\"13\"] [data-test=blade-list] > li .grow')"))->toBe(['Connect your calendar', 'Invite a teammate', 'Try dark mode']);
    })->with([['offline'], ['error']]);
});

describe('14 · duplicate', function () {
    it('shows the sorted copy at once and exactly once afterwards', function () {
        $page = demo(['latency' => 500]);
        $page->click('[data-example="14"] [data-test=blade-list] li:first-child button');

        expect(js($page, "return T.texts('[data-example=\"14\"] [data-test=blade-list] > li .grow')"))->toBe(['About us', 'About us (copy)', 'Changelog', 'Pricing']);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-example=\"14\"] [data-test=blade-list] > li .grow'), T.texts('[data-example=\"14\"] [data-test=alpine-list] > li .grow')]"))
            ->toBe([['About us', 'About us (copy)', 'Changelog', 'Pricing'], ['About us', 'About us (copy)', 'Changelog', 'Pricing']]);
    });
});

describe('15 · follow', function () {
    it('updates label and count together', function () {
        $page = demo(['latency' => 400]);
        $page->click('[data-test=follow-blade]');

        expect(js($page, "return T.texts('[data-example=\"15\"] [data-pane=blade] .profile')"))->toBe(['Ada 1204 followers Following']);

        js($page, 'await T.idle()');
        expect(js($page, 'return T.consistent(15)'))->toBeTrue();
    });
});

describe('16 · avatar upload', function () {
    // The in-process test server can't store multipart uploads, so the upload
    // itself fails here. That still shows both halves: the preview appears
    // before anything was uploaded, and it is rolled back when storing fails.
    // (Successful and invalid uploads are covered by the JS suite and were
    // verified against the real workbench server.)
    it('previews the file at once and rolls back when the upload cannot be stored', function () {
        $page = demo(['latency' => 600]);
        $before = js($page, "return document.querySelector('[data-test=avatar]').getAttribute('src')");
        $page->attach('[data-test=avatar-input]', __DIR__.'/files/avatar.png');

        expect(js($page, "return [document.querySelector('[data-test=avatar]').getAttribute('src').startsWith('blob:'), document.querySelector('[data-test=avatar]').classList.contains('opt-pending')]"))
            ->toBe([true, true]);

        js($page, "await T.until(() => T.entries()[0]?.status === 'failed', 15000)");

        expect(js($page, "return [document.querySelector('[data-test=avatar]').getAttribute('src'), document.querySelector('[data-test=avatar]').classList.contains('opt-failed')]"))
            ->toBe([$before, true]);
    });
});

describe('17 · assign', function () {
    it('shows the new assignee at once', function () {
        $page = demo(['latency' => 400]);
        $page->select('[data-example="17"] [data-test=blade-list] li:first-child select', (string) Models\Person::where('name', 'Linus')->value('id'));

        expect(js($page, "return T.texts('[data-example=\"17\"] [data-test=alpine-list] > li .grow')[0]"))->toBe('Login is slow · Linus');

        js($page, 'await T.idle()');
        expect(js($page, "return T.texts('[data-example=\"17\"] [data-test=blade-list] > li .grow')[0]"))->toBe('Login is slow · Linus');
    });
});

describe('18 · settings', function () {
    it('toggles and rolls back', function () {
        $page = demo(['latency' => 300, 'mode' => 'offline']);
        $page->click('[data-example="18"] [data-pane=blade] .toggle:nth-of-type(2) input');

        expect(js($page, "return [...T.card(18).querySelectorAll('[data-pane=alpine] input')].map(input => input.checked)"))->toBe([true, true, false]);

        js($page, 'await T.idle()');
        expect(js($page, "return [...T.card(18).querySelectorAll('[data-pane=blade] input')].map(input => input.checked)"))->toBe([true, false, false]);
    });
});

describe('19 · restore from trash', function () {
    it('moves the file between the lists', function () {
        $page = demo(['latency' => 500]);
        $page->click('[data-test=blade-trash] li:first-child button');

        expect(js($page, "return [T.texts('[data-test=blade-files] > li .grow'), T.texts('[data-test=blade-trash] > li .grow'), T.texts('[data-test=alpine-files] > li .grow')]"))
            ->toBe([['budget.xlsx', 'draft-v1.docx', 'logo.svg'], ['old-notes.txt'], ['budget.xlsx', 'draft-v1.docx', 'logo.svg']]);

        js($page, 'await T.idle()');

        expect(js($page, "return [T.texts('[data-test=blade-files] > li .grow'), T.texts('[data-test=blade-trash] > li .grow')]"))
            ->toBe([['budget.xlsx', 'draft-v1.docx', 'logo.svg'], ['old-notes.txt']]);
        expect(Models\File::pluck('name')->sort()->values()->all())->toBe(['budget.xlsx', 'draft-v1.docx', 'logo.svg']);
    });
});

describe('20 · timer', function () {
    it('starts at once and the server corrects the start time', function () {
        $page = demo(['latency' => 400]);
        $page->click('[data-example="20"] [data-pane=blade] .timer button:first-of-type');

        expect(js($page, "return T.visible('[data-example=\"20\"] [data-pane=alpine] .timer button:last-of-type')"))->toBeTrue();

        js($page, 'await T.idle()');
        expect(js($page, 'return T.consistent(20)'))->toBeTrue();
    });
});
