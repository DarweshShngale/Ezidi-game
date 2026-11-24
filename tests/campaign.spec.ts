import { test, expect } from '@playwright/test'
import { chapters } from '../src/story'

test('walk every objective through seven chapters, share supplies, reunite and finish', async ({
  page,
}) => {
  test.setTimeout(20 * 60 * 1000)
  await page.setViewportSize({ width: 480, height: 300 })
  await page.goto('./')
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
  await page.locator('[data-setting=quality]').selectOption('0')
  await page.locator('[data-setting=difficulty]').selectOption('0')
  await page.getByRole('button', { name: 'تمّ', exact: true }).click()
  await page.locator('#start').click()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const [index, c] of chapters.entries()) {
    await test.step(c.name, async () => {
      await expect(page.locator('.film h2')).toHaveText(c.name)
      await page.locator('[data-do=enter]').click()
      await expect(page.locator('#hud')).toBeVisible({ timeout: 60000 })
      for (const [i, t] of c.tasks.entries()) {
        await expect(page.locator('#mission')).toHaveText(t.title)
        await page.keyboard.press('KeyG')
        await expect(page.locator('#interact-prompt')).toBeVisible({ timeout: 90000 })
        await expect(async () => {
          await page.keyboard.press('KeyE')
          if (i === c.tasks.length - 1)
            await expect(page.locator('[data-do=next]')).toBeVisible({ timeout: 4500 })
          else
            await expect(page.locator('#mission')).toHaveText(c.tasks[i + 1].title, { timeout: 4500 })
        }).toPass({ timeout: 35000, intervals: [500] })
      }
      console.log('Completed chapter', index + 1)
      await page.locator('[data-do=next]').click()
    })
  }
  await expect(page.locator('#home')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'اختيار الفصل' }).click()
  await page.locator('.chapter-card').last().click()
  await expect(page.getByRole('button', { name: 'العب الفصل' })).toBeEnabled()
  expect(errors).toEqual([])
})
