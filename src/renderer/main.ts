/** Renderer entry point — mounts the Vue application. */
import { createApp } from 'vue';

import { i18n } from '@/renderer/i18n';
import '@/renderer/styles/index.scss';
import App from '@/renderer/App.vue';
import { migrateLegacyStorageKeys } from '@/renderer/utils/legacyStorage';

migrateLegacyStorageKeys(localStorage);
createApp(App).use(i18n).mount('#app');
