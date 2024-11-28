import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    logLevel: 'info',
    base: '', // 相対パスを使用する設定
    // build: {
    //     rollupOptions: {
    //         external: ['apache-arrow']
    //     }
    // },
    // optimizeDeps: {
    //     include: ['apache-arrow']  // 事前に最適化する依存関係を指定
    // },
    // resolve: {
    //     alias: {
    //         'apache-arrow': path.resolve(__dirname, 'node_modules/apache-arrow')
    //     }
    // },
})