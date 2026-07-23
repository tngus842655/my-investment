import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'firepath',
  brand: {
    displayName: '파이어패스', // 앱인토스 콘솔에 제출한 미니앱 이름과 동일
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/appsintoss/61261/2d2ec749-02d7-4ae9-aa54-c0cc77541bdd.png', // 콘솔에 업로드한 로고와 동일한 이미지
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
