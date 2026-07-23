import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'firepath',
  brand: {
    displayName: '파이어패스', // 앱인토스 콘솔에 제출한 미니앱 이름과 동일
    primaryColor: '#3182F6',
    icon: '', // 콘솔에 업로드한 아이콘의 링크(https://static.toss.im/appsintoss/...)를 붙여넣을 것
  },
  web: {
    host: 'localhost',
    port: 3820,
    commands: {
      dev: 'vite',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
