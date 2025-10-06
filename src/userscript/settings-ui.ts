import Settings from './components/Settings.svelte';
import { getSettings } from './settings';
import { mount, unmount } from 'svelte';

export function openSettingsOverlay() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = mount(Settings, {
        target: container,
        props: {
            initial: getSettings(),
            onClose: () => {
                unmount(app);
                container.remove();
            },
        },
    });
}


