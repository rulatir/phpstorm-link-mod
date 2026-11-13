import { expect, test } from 'claude-code/testing'

import { editorWindowId, fileBasename, interceptTargets, phpstormUrl, rewritePhpstormLinks } from './links'

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

test('phpstorm:// link targets become intercept targets; text and bare URLs stay', () => {
  expect(rewritePhpstormLinks('See [a.php:12](phpstorm://open?file=/srv/a.php&line=12).')).toBe(
    `See [a.php:12](${LINK}).`,
  )
  expect(rewritePhpstormLinks('**[a](phpstorm://open?file=/a&line=1)**')).toBe(
    '**[a](https://phpstorm.intercept/open?file=/a&line=1)**',
  )
  expect(rewritePhpstormLinks('Bare phpstorm://open?file=/a and [x](https://example.com).')).toBe(
    'Bare phpstorm://open?file=/a and [x](https://example.com).',
  )
})

test('a phpstorm:// link is drawn pressable on desktop and left to the terminal', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const written = 'See [a.php:12](phpstorm://open?file=/srv/a.php&line=12).'

  const desktop = await $.ui.mount(message(written, 'desktop'))
  const md = await desktop.find({ key: 'phpstorm-links' })
  expect(md?.props.text).toBe(`See [a.php:12](${LINK}).`)
  expect(md?.props.pressableLinks).toEqual([LINK])
  await desktop.unmount()

  const terminal = await $.ui.mount(message(written, 'terminal'))
  expect(await terminal.find({ key: 'phpstorm-links' })).toBeUndefined()
  await terminal.unmount()
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

test('the link rule is added to the system prompt on desktop only', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine', scope: 'shared' }] }))

  const input = {
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    tools: [],
    outputStyle: null,
    traits: [],
  } as const

  const desktop = await $.prompt.compose({ ...input, surfaces: ['desktop'] })
  expect(desktop.sections.map(s => s.id)).toEqual(['intro', 'phpstorm-links:rule'])
  expect(desktop.sections[1]?.text).toContain('phpstorm://open?file=')
  expect(desktop.sections[1]?.text).not.toContain('phpstorm.intercept')

  const terminal = await $.prompt.compose({ ...input, surfaces: ['terminal'] })
  expect(terminal.sections.map(s => s.id)).toEqual(['intro'])
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
