import {test,expect,type Page} from '@playwright/test'
import {mkdir} from 'node:fs/promises'

async function begin(page:Page){
  await page.goto('./');await page.getByRole('button',{name:'ابدأ اللعبة',exact:true}).click()
  await page.getByRole('button',{name:'ادخل الفصل',exact:true}).click()
  await expect(page.locator('#hud')).toBeVisible({timeout:60000})
  await expect(page.locator('#game-canvas canvas')).toBeVisible()
}
async function capture(page:Page,name:string){if(process.env.GAME_SCREENSHOTS){await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/'+name+'.jpg',type:'jpeg',quality:84})}}

test('Arabic title, chapter selection, settings, campaign, checkpoint and offline reload',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const missing:string[]=[];page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(new URL(page.url()).origin))missing.push(r.url())})
  await page.goto('./');await page.evaluate(()=>document.fonts.ready);await expect(page.locator('html')).toHaveAttribute('dir','rtl')
  await expect(page.getByRole('heading',{name:'سنجار',exact:true})).toBeVisible()
  await capture(page,'title')
  await page.getByRole('button',{name:'اختيار الفصل',exact:true}).click()
  await expect(page.locator('.chapter-card')).toHaveCount(7);await page.locator('.chapter-card').last().click()
  await expect(page.getByText('يُفتح بعد إكمال الفصل السابق.',{exact:false})).toBeVisible()
  await page.getByRole('button',{name:'رجوع',exact:true}).click();await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'الإعدادات',exact:true}).click()
  await page.locator('[data-setting=quality]').selectOption('0');await page.getByRole('button',{name:'تمّ',exact:true}).click()
  await begin(page)
  await expect(page.locator('#mission')).toHaveText('تحدّث مع أمّك في الحوش')
  await page.keyboard.down('KeyW');await expect(page.locator('#interact-prompt')).toBeVisible({timeout:30000});await page.keyboard.up('KeyW')
  await page.keyboard.press('KeyE');await expect(page.locator('#mission')).toHaveText('التقط دفتر ديلان قرب الفرن',{timeout:40000})
  await capture(page,'neighborhood')
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'توقّف مؤقت'})).toBeVisible()
  await page.getByRole('button',{name:'القائمة الرئيسية'}).click();await page.reload()
  await page.getByRole('button',{name:'متابعة اللعبة',exact:true}).click()
  await expect(page.locator('#mission')).toHaveText('التقط دفتر ديلان قرب الفرن')
  await page.evaluate(()=>navigator.serviceWorker.ready)
  await page.reload();await expect(page.getByRole('button',{name:'متابعة اللعبة',exact:true})).toBeEnabled()
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'سنجار',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'متابعة اللعبة',exact:true}).click();await expect(page.locator('#hud')).toBeVisible({timeout:60000})
  expect(errors).toEqual([]);expect(missing).toEqual([])
})

test('touch joystick, simultaneous look, actions, pause and RTL settings in mobile landscape',async({browser})=>{
  const ctx=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:740,height:375},deviceScaleFactor:1})
  const p=await ctx.newPage();const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message))
  await p.goto(process.env.GAME_URL||'http://127.0.0.1:4187/Ezidi-game/')
  await p.locator('#start').tap();await p.getByRole('button',{name:'ادخل الفصل'}).tap();await expect(p.locator('#hud')).toBeVisible({timeout:60000})
  const stick=await p.locator('#stick').boundingBox();expect(stick).toBeTruthy()
  const x=stick!.x+stick!.width/2,y=stick!.y+stick!.height/2
  const cdp=await ctx.newCDPSession(p)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1},{x:350,y:150,id:2}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-31,id:1},{x:355,y:151,id:2}]})
  await expect(p.locator('#interact-prompt')).toBeVisible({timeout:30000})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await p.locator('[data-key=act]').tap();await expect(p.locator('#mission')).toContainText('دفتر',{timeout:40000})
  await p.locator('[data-key=jump]').tap();await p.locator('[data-key=crouch]').tap()
  await capture(p,'mobile');await p.getByRole('button',{name:'إيقاف مؤقت'}).tap();await p.getByRole('button',{name:'الإعدادات'}).tap()
  await p.locator('[data-setting=mirror]').check();await p.getByRole('button',{name:'تمّ'}).tap();await p.getByRole('button',{name:'العودة إلى اللعب'}).tap()
  expect((await p.locator('#stick').boundingBox())!.x).toBeGreaterThan(370)
  expect(errors).toEqual([]);await ctx.close()
})
