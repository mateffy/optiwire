<?php

namespace Workbench\App\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;
use Workbench\App\Models\Kv;

class AvatarUpload extends Component
{
    use WithFileUploads;

    public $avatar;

    public function updatedAvatar(): void
    {
        $this->validate(['avatar' => 'image|max:1024'], ['avatar.max' => 'Images must be smaller than 1 MB.']);

        $path = $this->avatar->store('avatars', 'local');
        Kv::put('avatar', basename($path));
        $this->avatar = null;
    }

    public function getAvatarUrlProperty(): string
    {
        $file = Kv::get('avatar');

        return $file ? url('/demo/avatars/'.$file) : 'data:image/svg+xml;utf8,'.rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e2e8f0"/><circle cx="32" cy="25" r="11" fill="#94a3b8"/><path d="M12 56c3-11 11-16 20-16s17 5 20 16" fill="#94a3b8"/></svg>');
    }

    public function render()
    {
        return view('livewire.avatar-upload', ['avatarUrl' => $this->avatarUrl]);
    }
}
