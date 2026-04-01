import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'sample-2',
  brand: {
    displayName: '샘플2', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: 'https://static.toss.im/icons/png/4x/icon-person-man.png',
  },
  web: {
    host: '192.168.45.130',
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'tsc -b && vite build',
    },
  },
  webViewProps: {
    type: 'partner',
  },
  permissions: [],
  outdir: 'dist',
});
