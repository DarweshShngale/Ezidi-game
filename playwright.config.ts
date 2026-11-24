import {defineConfig} from '@playwright/test'
const target=process.env.GAME_URL||'http://127.0.0.1:4187/Ezidi-game/'
export default defineConfig({
  testDir:'./tests',workers:1,timeout:150000,expect:{timeout:15000},
  use:{actionTimeout:15000,baseURL:target,viewport:{width:960,height:600},launchOptions:{executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:process.env.GAME_URL?undefined:{command:'npm run preview -- --port 4187 --strictPort',url:target,timeout:30000,reuseExistingServer:!process.env.CI}
})
