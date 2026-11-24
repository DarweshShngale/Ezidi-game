import {defineConfig} from 'vite'
export default defineConfig({base:'/Ezidi-game/',build:{target:'es2022',chunkSizeWarningLimit:2300,rollupOptions:{output:{manualChunks(id){if(id.includes('@dimforge/'))return 'physics';if(id.includes('/three/'))return 'three'}}}},server:{host:'0.0.0.0',allowedHosts:true}})
