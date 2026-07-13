import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    name: 'app-notes',
    excludeSources: ['HANDOFF.md'],
  },
  webExt: {
    startUrls: ['https://yahoo.com'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'App Notes',
    short_name: 'App Notes',
    description: 'Annotate elements on any website and export every note in one place.',
    author: 'Michael Ramos (@backnotprop)',
    homepage_url: 'https://github.com/plannotator/app-notes',
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'webNavigation',
      ...(browser === 'chrome' ? ['sidePanel'] : []),
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'app-notes@plannotator.ai',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      toggle_annotation: {
        suggested_key: { default: 'Ctrl+Shift+X', mac: 'Command+Shift+X' },
        description: 'Toggle annotation mode',
      },
      open_side_panel: {
        suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' },
        description: 'Open App Notes side panel',
      },
    },
  }),
});
