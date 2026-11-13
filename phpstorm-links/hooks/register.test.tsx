import { expect, test } from 'claude-code/testing'

import { editorWindowId, fileBasename, interceptTargets, phpstormUrl } from './links'

const GDBUS_MATCH =
  "([('0_{d6579f51-96f8}', 'cerise – a.php', '', 30, 0.7, {}), " +
  `('0_{aaaa}', "bob's notes – b.php", '', 30, 0.7, {})],)`

const LINK = 'https://phpstorm.intercept/open?file=/srv/a.php&line=12'
const TEXT = `See [a.php:12](${LINK}) and [docs](https://example.com/x).`

const message = (text: string, surface: 'terminal' | 'desktop' | 'vscode' | 'mobile') =>
  ({
    plugin: 'phpstorm-links',
    surface,
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text, isFirstOfReply: true },
  }) as const

test('intercept targets are found, deduplicated, and others skipped', () => {
  expect(interceptTargets(`${TEXT} again [b](${LINK}) <http://phpstorm.intercept/x>`)).toEqual([
    LINK,
    'http://phpstorm.intercept/x',
  ])
  expect(interceptTargets('[x](https://phpstorm.intercepted/y)')).toEqual([])
})

test('the rewrite maps the path after the host onto phpstorm://', () => {
  expect(phpstormUrl(LINK)).toBe('phpstorm://open?file=/srv/a.php&line=12')
  expect(phpstormUrl('http://phpstorm.intercept/open?file=/b')).toBe('phpstorm://open?file=/b')
  expect(phpstormUrl('https://example.com/x')).toBeUndefined()
})

test('the file base name comes from the file parameter', () => {
  expect(fileBasename('phpstorm://open?file=/srv/a.php&line=12')).toBe('a.php')
  expect(fileBasename('phpstorm://open?file=/srv/a.php:12')).toBe('a.php')
  expect(fileBasename('phpstorm://open?url=x')).toBeUndefined()
})

test('the editor window is the one whose title names the file', () => {
  expect(editorWindowId(GDBUS_MATCH, 'a.php')).toBe('0_{d6579f51-96f8}')
  expect(editorWindowId(GDBUS_MATCH, 'b.php')).toBe('0_{aaaa}')
  expect(editorWindowId(GDBUS_MATCH, 'c.php')).toBeUndefined()
  expect(editorWindowId("([('0_{x}', 'a.php - Viewer', '', 1, 1.0, {})],)", 'a.php')).toBeUndefined()
})

test('a message with an intercept link draws one Markdown that claims only that link', async ($, on) => {
  const runs: (readonly string[])[] = []
  on('process.run', (_, e) => {
    runs.push(e.argv)
    const stdout = e.argv.includes('org.kde.krunner1.Match') ? GDBUS_MATCH : ''
    return {
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('clock.now', () => ({ value: 0 }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(message(TEXT, surface))
    const md = await ui.find({ key: 'phpstorm-links' })
    expect(md?.type).toBe('Markdown')
    expect(md?.props.text).toBe(TEXT)
    expect(md?.props.pressableLinks).toEqual([LINK])
    await ui.press({ key: 'phpstorm-links', link: { href: LINK } })
    await ui.unmount()
  }

  expect(toasts).toEqual([])
  // Per press: launch, find the window, activate it.
  expect(runs).toHaveLength(12)
  expect(runs[0]?.at(-1)).toBe('phpstorm://open?file=/srv/a.php&line=12')
  expect(runs[1]?.at(-1)).toBe('a.php')
  expect(runs[2]?.slice(-2)).toEqual(['0_{d6579f51-96f8}', ''])
})

test('a message without an intercept link goes to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount(message('Plain [docs](https://example.com/x).', 'desktop'))
  expect(await ui.find({ key: 'phpstorm-links' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
